from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    BarcodeReservation,
    CatalogProduct,
    Category,
    Counterparty,
    Industry,
    InventoryItem,
    Invoice,
    InvoiceLine,
    Label,
    ProductBarcode,
    Store,
    StoreMembership,
    StoreRole,
    User,
)
from ..security import hash_password
from ..services.store_service import create_owner_store


QA_NAMESPACE = "qa-gate7"
PROFILE_SPECS = {
    "smoke": {"stores": (("smoke", "free", 8),)},
    "comprehensive": {
        "stores": (
            ("auto", "free", 18),
            ("retail", "pro", 24),
            ("team", "vip", 30),
        )
    },
}


@dataclass(frozen=True)
class SeedSummary:
    profile: str
    stores: int
    users: int
    products: int
    counterparties: int
    invoices: int
    barcodes: int
    dry_run: bool

    def to_dict(self) -> dict:
        return asdict(self)


def _stable_int(value: str, *, offset: int = 0) -> int:
    return int(hashlib.sha256(value.encode()).hexdigest()[:12], 16) % 900_000_000 + 100_000_000 + offset


def _phone(value: str) -> str:
    return f"09{_stable_int(value) % 1_000_000_000:09d}"


def _industry(db: Session, key: str) -> Industry:
    name = f"آزمایشی {QA_NAMESPACE} {key}"
    industry = db.scalar(select(Industry).where(Industry.name == name))
    if industry is None:
        industry = Industry(name=name, description="داده مصنوعی و غیرقابل انتشار Gate 7", is_active=True)
        db.add(industry)
        db.flush()
    return industry


def _owner(db: Session, key: str, plan: str, password_hash: str) -> tuple[User, Store, StoreMembership]:
    username = f"{QA_NAMESPACE}-{key}-owner"
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(
            username=username,
            first_name="کاربر",
            last_name=f"آزمایشی {key}",
            phone=_phone(username),
            hashed_password=password_hash,
            plan=plan,
            is_active=True,
        )
        db.add(user)
        db.flush()
        context = create_owner_store(db, user)
        store, membership = context.store, context.membership
    else:
        membership = db.scalar(select(StoreMembership).where(
            StoreMembership.user_id == user.id,
            StoreMembership.is_owner.is_(True),
        ))
        if membership is None:
            raise RuntimeError("QA_OWNER_MEMBERSHIP_MISSING")
        store = db.get(Store, membership.store_id)
        if store is None or store.owner_user_id != user.id:
            raise RuntimeError("QA_STORE_OWNERSHIP_INVALID")
    user.plan = store.plan = plan
    store.name = f"مجموعه آزمایشی {QA_NAMESPACE} {key}"
    return user, store, membership


def _seed_store(db: Session, key: str, plan: str, product_count: int, password_hash: str) -> dict[str, int]:
    owner, store, membership = _owner(db, key, plan, password_hash)
    industry = _industry(db, key)
    owner.industry_id = store.industry_id = industry.id

    categories: list[Category] = []
    for index, name in enumerate(("قطعات مصرفی", "ابزار", "کالاهای فروشگاهی"), start=1):
        scoped_name = f"{name} — {QA_NAMESPACE}-{key}"
        category = db.scalar(select(Category).where(Category.store_id == store.id, Category.name == scoped_name))
        if category is None:
            category = Category(
                store_id=store.id, user_id=owner.id, name=scoped_name,
                description="دسته مصنوعی Gate 7", code=f"Q{index:02d}",
                sector_code="99", origin="custom", approval_status="approved", is_active=True,
            )
            db.add(category)
            db.flush()
        categories.append(category)

    labels: list[Label] = []
    for name in ("پرفروش", "نیازمند سفارش", "بدون تصویر"):
        normalized = f"{QA_NAMESPACE}-{key}-{name}"
        label = db.scalar(select(Label).where(Label.store_id == store.id, Label.normalized_name == normalized))
        if label is None:
            label = Label(store_id=store.id, user_id=owner.id, name=name, normalized_name=normalized)
            db.add(label)
            db.flush()
        labels.append(label)

    products: list[InventoryItem] = []
    for index in range(1, product_count + 1):
        identity = f"{QA_NAMESPACE}-{key}-product-{index:05d}"
        catalog = db.scalar(select(CatalogProduct).where(
            CatalogProduct.industry_id == industry.id,
            CatalogProduct.name == identity,
            CatalogProduct.is_shared.is_(False),
        ))
        if catalog is None:
            catalog = CatalogProduct(
                industry_id=industry.id,
                name=identity,
                description="محصول مصنوعی Gate 7؛ فاقد مجوز انتشار",
                brand="تنظیم QA",
                is_shared=False,
                is_active=index % 17 != 0,
                is_packaged=index % 5 == 0,
                pack_size=12 if index % 5 == 0 else None,
            )
            db.add(catalog)
            db.flush()
        item = db.scalar(select(InventoryItem).where(
            InventoryItem.store_id == store.id,
            InventoryItem.catalog_product_id == catalog.id,
        ))
        quantity = 0 if index % 7 == 0 else index + 4
        sale_price = 50_000 + index * 12_500
        if item is None:
            item = InventoryItem(
                store_id=store.id, user_id=owner.id, catalog_product_id=catalog.id,
                category_id=categories[index % len(categories)].id,
                quantity=quantity, price=sale_price, sale_price=sale_price,
                purchase_price=max(0, sale_price - 15_000),
                custom_label=("نام بسیار بلند محصول آزمایشی برای سنجش چیدمان رابط کاربری " if index == 2 else "کالای آزمایشی ") + str(index),
                low_stock_threshold=5, low_stock_alert=0 < quantity <= 5,
                is_hidden=index % 19 == 0,
                note=f"{QA_NAMESPACE}:{key}:{index}",
            )
            item.labels.extend(labels[: 1 + (index % len(labels))])
            db.add(item)
            db.flush()
        products.append(item)

        barcode_value = f"Q7{_stable_int(identity):09d}{index % 10}"
        reservation = db.scalar(select(BarcodeReservation).where(
            BarcodeReservation.store_id == store.id, BarcodeReservation.value == barcode_value,
        ))
        if reservation is None:
            reservation = BarcodeReservation(
                store_id=store.id, value=barcode_value, target_type="product", target_id=item.id,
                origin="external", status="active",
            )
            db.add(reservation)
            db.flush()
            db.add(ProductBarcode(
                store_id=store.id, product_id=item.id, value=barcode_value,
                source="manufacturer", symbology="code128", meaning="unit",
                scan_quantity=1, is_active=True, is_default=True,
                lifecycle_status="active", reservation_id=reservation.id,
            ))

    parties: list[Counterparty] = []
    for suffix, kind in (("supplier", "organization"), ("customer", "person")):
        name = f"{QA_NAMESPACE}-{key}-{suffix}"
        party = db.scalar(select(Counterparty).where(Counterparty.store_id == store.id, Counterparty.name == name))
        if party is None:
            party = Counterparty(
                store_id=store.id, created_by_user_id=owner.id, kind=kind, name=name,
                phone=_phone(name), address="نشانی کاملاً مصنوعی، تهران، واحد آزمایش",
            )
            db.add(party)
            db.flush()
        parties.append(party)

    for invoice_type, party, age in (("purchase", parties[0], 7), ("sale", parties[1], 0)):
        operation_id = f"{QA_NAMESPACE}-{key}-{invoice_type}-001"
        invoice = db.scalar(select(Invoice).where(
            Invoice.store_id == store.id, Invoice.post_operation_id == operation_id,
        ))
        if invoice is None:
            chosen = products[: min(3, len(products))]
            unit_prices = [p.purchase_price if invoice_type == "purchase" else p.sale_price for p in chosen]
            total = sum(int(price or 0) * 2 for price in unit_prices)
            invoice = Invoice(
                id=_stable_int(operation_id),
                store_id=store.id, actor_user_id=owner.id, actor_membership_id=membership.id,
                invoice_type=invoice_type, title=f"فاکتور {invoice_type} آزمایشی",
                counterparty_id=party.id, counterparty=party.name, status="posted",
                total_amount=total, post_operation_id=operation_id,
                posted_at=datetime.now(timezone.utc) - timedelta(days=age),
            )
            db.add(invoice)
            db.flush()
            for position, (product, price) in enumerate(zip(chosen, unit_prices), start=1):
                final = product.quantity
                before = max(0, final - 2) if invoice_type == "purchase" else final + 2
                after = before + 2 if invoice_type == "purchase" else before - 2
                db.add(InvoiceLine(
                    invoice_id=invoice.id, store_id=store.id, product_id=product.id,
                    position=position, product_name=product.custom_label or product.catalog_product.name,
                    quantity=2, unit="عدد", pack_size=None, base_quantity=2,
                    unit_price=int(price or 0), line_total=int(price or 0) * 2,
                    before_quantity=before, after_quantity=after,
                ))

    if key == "team":
        role = db.scalar(select(StoreRole).where(StoreRole.store_id == store.id, StoreRole.name == "اپراتور موجودی"))
        username = f"{QA_NAMESPACE}-{key}-operator"
        operator = db.scalar(select(User).where(User.username == username))
        if operator is None:
            operator = User(
                username=username, first_name="همکار", last_name="آزمایشی",
                phone=_phone(username), hashed_password=password_hash, plan=plan, is_active=True,
            )
            db.add(operator)
            db.flush()
            db.add(StoreMembership(
                store_id=store.id, user_id=operator.id, role_id=role.id,
                status="active", is_owner=False, authorization_checked_at=datetime.now(timezone.utc),
            ))
            store.operating_mode = "team"

    db.flush()
    return {"stores": 1, "users": 2 if key == "team" else 1, "products": len(products), "counterparties": 2, "invoices": 2, "barcodes": len(products)}


def seed_profile(db: Session, profile: str, *, password: str, dry_run: bool = False, stress_size: int | None = None) -> SeedSummary:
    if profile == "stress":
        if stress_size not in {1000, 5000, 10000}:
            raise ValueError("QA_STRESS_SIZE_MUST_BE_1000_5000_OR_10000")
        specs = ((f"stress-{stress_size}", "vip", stress_size),)
    else:
        try:
            specs = PROFILE_SPECS[profile]["stores"]
        except KeyError as error:
            raise ValueError("QA_PROFILE_UNKNOWN") from error
    expected = SeedSummary(
        profile=profile, stores=len(specs), users=sum(2 if key == "team" else 1 for key, _, _ in specs),
        products=sum(count for _, _, count in specs), counterparties=2 * len(specs),
        invoices=2 * len(specs), barcodes=sum(count for _, _, count in specs), dry_run=dry_run,
    )
    if dry_run:
        return expected
    password_hash = hash_password(password)
    totals = {"stores": 0, "users": 0, "products": 0, "counterparties": 0, "invoices": 0, "barcodes": 0}
    try:
        for key, plan, count in specs:
            for name, value in _seed_store(db, key, plan, count, password_hash).items():
                totals[name] += value
        db.commit()
    except Exception:
        db.rollback()
        raise
    return SeedSummary(profile=profile, dry_run=False, **totals)


def current_counts(db: Session) -> dict[str, int]:
    qa_users = select(User.id).where(User.username.startswith(f"{QA_NAMESPACE}-"))
    qa_stores = select(Store.id).where(Store.owner_user_id.in_(qa_users))
    return {
        "users": int(db.scalar(select(func.count()).select_from(User).where(User.username.startswith(f"{QA_NAMESPACE}-"))) or 0),
        "stores": int(db.scalar(select(func.count()).select_from(Store).where(Store.id.in_(qa_stores))) or 0),
        "products": int(db.scalar(select(func.count()).select_from(InventoryItem).where(InventoryItem.store_id.in_(qa_stores))) or 0),
        "counterparties": int(db.scalar(select(func.count()).select_from(Counterparty).where(Counterparty.store_id.in_(qa_stores))) or 0),
        "invoices": int(db.scalar(select(func.count()).select_from(Invoice).where(Invoice.store_id.in_(qa_stores))) or 0),
        "barcodes": int(db.scalar(select(func.count()).select_from(ProductBarcode).where(ProductBarcode.store_id.in_(qa_stores))) or 0),
    }
