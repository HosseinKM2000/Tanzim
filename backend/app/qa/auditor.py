from __future__ import annotations

from dataclasses import asdict, dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    BarcodeReservation,
    Category,
    InventoryItem,
    Invoice,
    InvoiceLine,
    ProductBarcode,
    Store,
    StoreMembership,
    User,
)
from .seeder import QA_NAMESPACE, current_counts


@dataclass(frozen=True)
class AuditFinding:
    code: str
    status: str
    detail: str


def audit(db: Session) -> dict:
    findings: list[AuditFinding] = []
    owners = list(db.scalars(select(User).where(User.username.startswith(f"{QA_NAMESPACE}-"), User.username.endswith("-owner"))))
    store_ids: list[int] = []
    for owner in owners:
        stores = list(db.scalars(select(Store).where(Store.owner_user_id == owner.id)))
        if len(stores) != 1:
            findings.append(AuditFinding("STORE_OWNERSHIP", "FAIL", f"owner={owner.id} stores={len(stores)}"))
            continue
        store = stores[0]
        store_ids.append(store.id)
        membership = db.scalar(select(StoreMembership).where(
            StoreMembership.store_id == store.id,
            StoreMembership.user_id == owner.id,
            StoreMembership.is_owner.is_(True),
            StoreMembership.status == "active",
        ))
        if membership is None:
            findings.append(AuditFinding("OWNER_MEMBERSHIP", "FAIL", f"store={store.id}"))
        if store.industry_id != owner.industry_id:
            findings.append(AuditFinding("INDUSTRY_CONSISTENCY", "FAIL", f"store={store.id}"))

    if store_ids:
        cross_category = db.scalar(select(func.count()).select_from(InventoryItem).join(
            Category, InventoryItem.category_id == Category.id
        ).where(InventoryItem.store_id.in_(store_ids), Category.store_id != InventoryItem.store_id)) or 0
        if cross_category:
            findings.append(AuditFinding("CATEGORY_CROSS_TENANT", "FAIL", str(cross_category)))

        duplicate_barcodes = list(db.execute(select(
            ProductBarcode.store_id, ProductBarcode.value, func.count(ProductBarcode.id)
        ).where(ProductBarcode.store_id.in_(store_ids)).group_by(
            ProductBarcode.store_id, ProductBarcode.value
        ).having(func.count(ProductBarcode.id) > 1)))
        if duplicate_barcodes:
            findings.append(AuditFinding("BARCODE_UNIQUENESS", "FAIL", str(len(duplicate_barcodes))))

        broken_reservations = db.scalar(select(func.count()).select_from(ProductBarcode).outerjoin(
            BarcodeReservation, ProductBarcode.reservation_id == BarcodeReservation.id
        ).where(ProductBarcode.store_id.in_(store_ids), BarcodeReservation.id.is_(None))) or 0
        if broken_reservations:
            findings.append(AuditFinding("BARCODE_RESERVATION", "FAIL", str(broken_reservations)))

        bad_lines = db.scalar(select(func.count()).select_from(InvoiceLine).join(
            Invoice, InvoiceLine.invoice_id == Invoice.id
        ).where(
            Invoice.store_id.in_(store_ids),
            (InvoiceLine.line_total != InvoiceLine.quantity * InvoiceLine.unit_price)
            | (InvoiceLine.store_id != Invoice.store_id),
        )) or 0
        if bad_lines:
            findings.append(AuditFinding("INVOICE_LINE_INTEGRITY", "FAIL", str(bad_lines)))

    if not findings:
        findings.append(AuditFinding("QA_INVARIANTS", "PASS", "ownership, tenant, industry, barcode and invoice checks passed"))
    return {
        "namespace": QA_NAMESPACE,
        "counts": current_counts(db),
        "status": "PASS" if all(item.status == "PASS" for item in findings) else "FAIL",
        "findings": [asdict(item) for item in findings],
    }
