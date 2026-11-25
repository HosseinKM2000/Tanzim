import base64
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from ..deps import CurrentProductReader, DbSession
from ..models import Invoice
from ..services.central_logger_service import ingest_log_events
from ..services.invoice_service import invoice_record
from ..services.ocr_service import (
    get_sample_invoice_result,
    match_products_to_inventory,
    parse_ocr_text,
    request_dongi_ocr,
)
from ..services.store_authorization import StorePermission, effective_permissions
from ..services.store_service import active_store_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])


class InvoiceOcrRequest(BaseModel):
    image: str | None = Field(default=None, description="Base64 encoded image or data URL")
    currency: Literal["auto", "toman", "rial"] = "auto"
    invoice_type: Literal["purchase", "sale"] = "purchase"
    sample: bool = False



def _read_context(db: DbSession, user: CurrentProductReader):
    permissions = effective_permissions(active_store_context(db, user))
    if StorePermission.INVOICES_VIEW.value not in permissions:
        raise HTTPException(403, detail=f"PERMISSION_REQUIRED:{StorePermission.INVOICES_VIEW.value}")
    # Historical invoices remain readable after a downgrade. New posting,
    # cancellation, reports and output still require the current capability.
    return permissions


@router.get("")
def list_invoices(current_user: CurrentProductReader, db: DbSession) -> list[dict]:
    permissions = _read_context(db, current_user)
    rows = db.execute(
        select(Invoice)
        .options(joinedload(Invoice.lines))
        .where(Invoice.store_id == current_user.store_id)
        .order_by(Invoice.posted_at.desc(), Invoice.id.desc())
    ).unique().scalars().all()
    show_purchase = StorePermission.PURCHASE_PRICE_VIEW.value in permissions
    return [invoice_record(row, include_purchase_prices=show_purchase) for row in rows]


@router.get("/{invoice_id}")
def get_invoice(invoice_id: int, current_user: CurrentProductReader, db: DbSession) -> dict:
    permissions = _read_context(db, current_user)
    row = db.execute(
        select(Invoice)
        .options(joinedload(Invoice.lines))
        .where(Invoice.id == invoice_id, Invoice.store_id == current_user.store_id)
    ).unique().scalar_one_or_none()
    if row is None:
        raise HTTPException(404, detail="INVOICE_NOT_FOUND")
    return invoice_record(
        row,
        include_purchase_prices=StorePermission.PURCHASE_PRICE_VIEW.value in permissions,
    )


@router.post("/ocr")
def process_invoice_ocr(
    payload: InvoiceOcrRequest,
    current_user: CurrentProductReader,
    db: DbSession,
) -> dict:
    permissions = effective_permissions(active_store_context(db, current_user))
    if StorePermission.INVOICES_VIEW.value not in permissions:
        raise HTTPException(403, detail=f"PERMISSION_REQUIRED:{StorePermission.INVOICES_VIEW.value}")
    if StorePermission.INVOICES_POST.value not in permissions:
        raise HTTPException(403, detail=f"PERMISSION_REQUIRED:{StorePermission.INVOICES_POST.value}")

    # Handle demo sample invoice request
    if payload.sample or not payload.image:
        sample_result = get_sample_invoice_result(db, current_user.store_id)
        try:
            ingest_log_events(
                db,
                app_id="tanzim-app",
                events=[{
                    "level": "info",
                    "category": "invoice",
                    "action": "invoice.ocr_sample_viewed",
                    "title": "مشاهده فاکتور نمونه OCR",
                    "message": f"فروشگاه {current_user.store_id}: مشاهده فاکتور نمونه OCR توسط {current_user.username}",
                    "store_id": current_user.store_id,
                    "user_id": current_user.id,
                }],
            )
        except Exception:
            pass
        return sample_result

    # Process uploaded invoice image
    raw_img = payload.image.strip()
    if "," in raw_img:
        raw_img = raw_img.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(raw_img)
    except Exception as exc:
        raise HTTPException(400, detail="تصویر فاکتور نامعتبر است (فرمت Base64 صحیح نیست)") from exc

    if len(image_bytes) < 100:
        raise HTTPException(400, detail="فایل تصویر فاکتور خالی یا ناقص است")

    try:
        ocr_markdown = request_dongi_ocr(image_bytes)
        parsed = parse_ocr_text(ocr_markdown, currency_preference=payload.currency)
        enriched_lines = match_products_to_inventory(
            db,
            store_id=current_user.store_id,
            extracted_items=parsed["lines"],
            invoice_type=payload.invoice_type,
        )
        parsed["lines"] = enriched_lines

        try:
            ingest_log_events(
                db,
                app_id="tanzim-app",
                events=[{
                    "level": "info",
                    "category": "invoice",
                    "action": "invoice.ocr_processed",
                    "title": "پردازش هوشمند فاکتور OCR",
                    "message": f"فروشگاه {current_user.store_id}: پردازش موفق OCR ({len(enriched_lines)} قلم، مجموع: {parsed['calculated_total']:,} تومان)",
                    "store_id": current_user.store_id,
                    "user_id": current_user.id,
                    "details": {
                        "items_count": len(enriched_lines),
                        "total": parsed["calculated_total"],
                        "supplier": parsed.get("supplier_name"),
                        "invoice_no": parsed.get("invoice_no"),
                    },
                }],
            )
        except Exception:
            pass
        return parsed
    except Exception as exc:
        logger.exception("Invoice OCR error: %s", exc)
        try:
            ingest_log_events(
                db,
                app_id="tanzim-app",
                events=[{
                    "level": "warn",
                    "category": "invoice",
                    "action": "invoice.ocr_failed",
                    "title": "خطای پردازش فاکتور OCR",
                    "message": f"فروشگاه {current_user.store_id}: خطا در پردازش فاکتور: {exc}",
                    "store_id": current_user.store_id,
                    "user_id": current_user.id,
                }],
            )
        except Exception:
            pass
        raise HTTPException(
            502,
            detail=f"پردازش فاکتور با خطا مواجه شد: {exc}. لطفاً از وضوح عکس اطمینان حاصل کرده و مجدداً تلاش کنید.",
        ) from exc

