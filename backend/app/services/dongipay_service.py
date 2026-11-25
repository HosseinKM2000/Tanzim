from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import StorePlanGrant, SubscriptionPayment

MIN_TOMAN = 1_000
MAX_TOMAN = 500_000_000

GATEWAY_ERRORS = {
    "invalid_merchant_key": "کلید درگاه دُنگی‌پی معتبر نیست.",
    "merchant_not_active": "پذیرنده درگاه دُنگی‌پی هنوز فعال نشده است.",
    "not_found": "سرویس پرداخت دُنگی‌پی در دسترس نیست.",
    "callback_domain_not_allowed": "دامنه بازگشت برای این پذیرنده مجاز نیست.",
    "order_ref_reused": "این شناسه سفارش قبلاً با مبلغ دیگری ثبت شده است.",
}


def gateway_ready() -> bool:
    return bool(settings.DONGIPAY_TOKEN and settings.DONGIPAY_BASE_URL)


def _call_dongipay(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    if not gateway_ready():
        raise HTTPException(status_code=503, detail="درگاه پرداخت دُنگی‌پی هنوز پیکربندی نشده است.")
    url = f"{settings.DONGIPAY_BASE_URL}{path}"
    data = json.dumps(body or {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {settings.DONGIPAY_TOKEN}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(raw) if raw else {}
        except ValueError:
            payload = {}
        err_code = payload.get("error") or payload.get("detail") or ""
        if isinstance(err_code, dict):
            err_code = err_code.get("error", "")
        msg = GATEWAY_ERRORS.get(str(err_code), f"خطا در ارتباط با درگاه دُنگی‌پی ({exc.code})")
        raise HTTPException(status_code=502, detail=msg) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="ارتباط با درگاه پرداخت دُنگی‌پی برقرار نشد.") from exc


def create_dongipay_payment(
    *,
    amount_toman: int,
    description: str,
    callback_url: str,
    order_ref: str,
) -> dict[str, Any]:
    if not MIN_TOMAN <= amount_toman <= MAX_TOMAN:
        raise HTTPException(status_code=422, detail=f"مبلغ پرداخت باید بین {MIN_TOMAN:,} و {MAX_TOMAN:,} تومان باشد.")
    payload = _call_dongipay(
        "POST",
        "/payments",
        {
            "amount": int(amount_toman),
            "description": description[:255],
            "callback_url": callback_url,
            "order_ref": str(order_ref)[:100],
        },
    )
    if not payload.get("id") or not payload.get("pay_url"):
        raise HTTPException(status_code=502, detail="پاسخ درگاه دُنگی‌پی ناقص بود.")
    return payload


def verify_dongipay_payment(dp_id: str) -> dict[str, Any]:
    return _call_dongipay("POST", f"/payments/{dp_id}/verify", {})


def is_first_month_eligible(db: Session, *, store_id: int | None, user_id: int) -> bool:
    """Return True when the store/user has never completed a paid plan grant or payment."""
    if store_id is not None:
        paid_grant = db.scalar(
            select(StorePlanGrant.id)
            .where(StorePlanGrant.store_id == store_id, StorePlanGrant.plan_id != "free")
            .limit(1)
        )
        if paid_grant is not None:
            return False
        paid_payment = db.scalar(
            select(SubscriptionPayment.id)
            .where(SubscriptionPayment.store_id == store_id, SubscriptionPayment.status == "verified")
            .limit(1)
        )
        if paid_payment is not None:
            return False
    user_payment = db.scalar(
        select(SubscriptionPayment.id)
        .where(SubscriptionPayment.user_id == user_id, SubscriptionPayment.status == "verified")
        .limit(1)
    )
    return user_payment is None
