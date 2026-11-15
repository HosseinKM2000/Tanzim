from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..config import settings
from ..deps import CurrentUser, DbSession
from ..models import StorePlanGrant, SubscriptionPayment, SubscriptionPlan
from ..plans import PLAN_CATALOG
from ..schemas import EntitlementOut, PlanDefinitionOut, PlanOfferOut
from ..services.dongipay_service import (
    create_dongipay_payment,
    gateway_ready,
    is_first_month_eligible,
    verify_dongipay_payment,
)
from ..services.logging_service import record_app_log
from ..services.plan_pricing import capture_plan_offer, price_toman_from_minor
from ..services.subscription_service import entitlement_for_user, list_plans, plan_payload

router = APIRouter(prefix="/plans", tags=["plans"])


class PlanCheckoutOut(BaseModel):
    payment_id: int
    order_ref: str
    dp_id: str
    pay_url: str
    plan_id: str
    amount_toman: int
    is_first_month_discount: bool


class PaymentVerifyIn(BaseModel):
    dp_id: str = Field(min_length=3, max_length=64)


@router.get("", response_model=list[PlanDefinitionOut])
def available_plans(_: CurrentUser, db: DbSession):
    # Starter remains readable for historical subscribers but is not an
    # approved V1 offering presented for new selection.
    return [plan_payload(plan) for plan in list_plans(db, active_only=True) if plan.id in {"free", "personal", "pro", "vip"}]


@router.get("/current", response_model=EntitlementOut)
def current_plan(current_user: CurrentUser, db: DbSession):
    return entitlement_for_user(db, current_user)


@router.get("/checkout-status")
def checkout_status(current_user: CurrentUser, db: DbSession):
    store_id = getattr(current_user, "store_id", None)
    return {
        "gateway_ready": gateway_ready(),
        "first_month_eligible": is_first_month_eligible(
            db, store_id=store_id, user_id=current_user.id
        ),
    }


@router.get("/{plan_id}/offer", response_model=PlanOfferOut)
def plan_offer(plan_id: str, _: CurrentUser, db: DbSession):
    snapshot = capture_plan_offer(db, plan_id)
    return {**snapshot.__dict__, "checkout_available": False,
            "checkout_status": "PAYMENT_PROVIDER_NOT_CONFIGURED"}


@router.post("/{plan_id}/checkout", response_model=PlanCheckoutOut)
def start_plan_checkout(plan_id: str, current_user: CurrentUser, db: DbSession):
    if plan_id not in {"personal", "pro", "vip"}:
        raise HTTPException(422, detail="این طرح قابل خرید آنلاین نیست.")
    plan = db.get(SubscriptionPlan, plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(404, detail="طرح انتخاب‌شده یافت نشد.")

    store_id = getattr(current_user, "store_id", None)
    if store_id is None:
        raise HTTPException(403, detail="مالکیت فروشگاه برای خرید اشتراک لازم است.")

    regular_toman = price_toman_from_minor(plan.price_minor) or 0
    first_month_minor = PLAN_CATALOG.get(plan_id, {}).get("first_month_price_minor")
    first_month_toman = price_toman_from_minor(first_month_minor) if first_month_minor is not None else None
    eligible = is_first_month_eligible(db, store_id=store_id, user_id=current_user.id)
    use_discount = bool(eligible and first_month_toman and first_month_toman < regular_toman)
    amount_toman = int(first_month_toman if use_discount else regular_toman)
    if amount_toman <= 0:
        raise HTTPException(422, detail="مبلغ طرح معتبر نیست.")

    order_ref = f"tz_{store_id}_{plan_id}_{uuid.uuid4().hex[:12]}"
    payment = SubscriptionPayment(
        order_ref=order_ref,
        user_id=current_user.id,
        store_id=store_id,
        plan_id=plan_id,
        amount_toman=amount_toman,
        is_first_month_discount=use_discount,
        gateway="dongipay",
        status="created",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    callback_url = f"{settings.APP_ORIGIN}/setting/subscription"
    description = f"اشتراک {plan.name} تنظیم ({'تخفیف ماه اول' if use_discount else 'ماهانه'})"
    try:
        gw = create_dongipay_payment(
            amount_toman=amount_toman,
            description=description,
            callback_url=callback_url,
            order_ref=order_ref,
        )
    except HTTPException as exc:
        payment.status = "failed"
        payment.error_message = str(exc.detail)
        db.commit()
        record_app_log(
            db,
            level="error",
            source="payment",
            event="dongipay.checkout_failed",
            message=str(exc.detail),
            user_id=current_user.id,
            store_id=store_id,
            details={"plan_id": plan_id, "order_ref": order_ref, "amount_toman": amount_toman},
            notify_telegram=True,
        )
        raise

    payment.dp_id = str(gw["id"])
    payment.pay_url = str(gw["pay_url"])
    db.commit()
    record_app_log(
        db,
        level="info",
        source="payment",
        event="dongipay.checkout_created",
        message=f"درخواست پرداخت {plan.name} به مبلغ {amount_toman:,} تومان ایجاد شد.",
        user_id=current_user.id,
        store_id=store_id,
        details={"plan_id": plan_id, "dp_id": payment.dp_id, "order_ref": order_ref, "discount": use_discount},
        notify_telegram=True,
    )
    return {
        "payment_id": payment.id,
        "order_ref": payment.order_ref,
        "dp_id": payment.dp_id,
        "pay_url": payment.pay_url,
        "plan_id": payment.plan_id,
        "amount_toman": payment.amount_toman,
        "is_first_month_discount": payment.is_first_month_discount,
    }


@router.post("/payments/verify")
def verify_plan_payment(payload: PaymentVerifyIn, current_user: CurrentUser, db: DbSession):
    payment = db.scalar(
        select(SubscriptionPayment).where(
            SubscriptionPayment.dp_id == payload.dp_id,
            SubscriptionPayment.user_id == current_user.id,
        )
    )
    if payment is None:
        raise HTTPException(404, detail="تراکنش پرداخت یافت نشد.")

    if payment.status == "verified":
        return {
            "verified": True,
            "plan_id": payment.plan_id,
            "amount_toman": payment.amount_toman,
            "ref_code": payment.ref_code,
            "entitlement": entitlement_for_user(db, current_user),
        }

    gw = verify_dongipay_payment(payload.dp_id)
    gw_status = str(gw.get("status") or "").lower()
    if gw_status != "verified":
        payment.status = "cancelled" if gw_status == "cancelled" else "failed"
        payment.error_message = f"gateway_status:{gw_status}"
        db.commit()
        record_app_log(
            db,
            level="warn",
            source="payment",
            event="dongipay.verify_not_paid",
            message=f"پرداخت تأیید نشد (وضعیت درگاه: {gw_status})",
            user_id=current_user.id,
            store_id=payment.store_id,
            details={"dp_id": payload.dp_id, "plan_id": payment.plan_id, "gw_status": gw_status},
            notify_telegram=True,
        )
        return {
            "verified": False,
            "status": gw_status,
            "plan_id": payment.plan_id,
            "amount_toman": payment.amount_toman,
        }

    now = datetime.now(timezone.utc)
    payment.status = "verified"
    payment.ref_code = str(gw.get("ref_code") or "") or None
    payment.verified_at = now

    if payment.store_id is not None:
        grant_req_id = f"dp_{payment.dp_id}"
        existing_grant = db.scalar(
            select(StorePlanGrant).where(StorePlanGrant.request_id == grant_req_id)
        )
        if existing_grant is None:
            db.add(
                StorePlanGrant(
                    request_id=grant_req_id,
                    store_id=payment.store_id,
                    plan_id=payment.plan_id,
                    source="dongipay",
                    reason=f"خرید اشتراک از طریق دُنگی‌پی (کد پیگیری: {payment.ref_code or payment.dp_id})",
                    starts_at=now,
                    ends_at=now + timedelta(days=30),
                    granted_by_user_id=current_user.id,
                )
            )
    current_user.plan = payment.plan_id
    db.commit()

    record_app_log(
        db,
        level="info",
        source="payment",
        event="dongipay.payment_verified",
        message=f"پرداخت اشتراک {payment.plan_id} به مبلغ {payment.amount_toman:,} تومان با موفقیت تأیید شد.",
        user_id=current_user.id,
        store_id=payment.store_id,
        details={"dp_id": payment.dp_id, "ref_code": payment.ref_code, "plan_id": payment.plan_id},
        notify_telegram=True,
    )
    return {
        "verified": True,
        "plan_id": payment.plan_id,
        "amount_toman": payment.amount_toman,
        "ref_code": payment.ref_code,
        "entitlement": entitlement_for_user(db, current_user),
    }
