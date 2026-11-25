from __future__ import annotations

import base64
import hashlib
import json
import uuid
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
    InventoryMovement,
    Label,
    MediaAsset,
    ProductBarcode,
    ReferenceCategory,
    ReferenceSector,
    Store,
    StoreActivity,
    StoreMembership,
    StoreRole,
    User,
)
from ..security import hash_password
from ..media_storage import media_storage
from ..services.store_service import create_owner_store
from ..services.canonical_taxonomy_seed import seed_canonical_taxonomy
from ..services.taxonomy_service import (
    active_taxonomy_version,
    issue_internal_barcode,
    proposed_taxonomy_enabled,
)


QA_NAMESPACE = "qa-gate7"
PROFILE_SPECS = {
    "smoke": {"stores": (("smoke", "free", 8),)},
    "automotive": {"stores": (("auto", "vip", 125),)},
    "five_sector": {
        "stores": (
            ("tax-auto", "vip", 48),
            ("tax-apparel", "vip", 48),
            ("tax-electronics", "vip", 48),
            ("tax-food", "vip", 48),
            ("tax-tools", "vip", 48),
        )
    },
    "comprehensive": {
        "stores": (
            ("empty", "free", 0),
            ("auto", "free", 18),
            ("retail", "pro", 24),
            ("team", "vip", 30),
            ("historical", "pro", 12),
        )
    },
}

QA_WEBP = base64.b64decode(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=="
)

STORE_FIXTURES = {
    "empty": {"industry": "فروشگاه تازه و بدون داده", "categories": (), "products": ()},
    "auto": {
        "industry": "قطعات خودرو",
        "categories": ("فیلتر و مصرفی", "برق خودرو", "لنت و ترمز"),
        "products": ("فیلتر روغن", "شمع موتور", "لنت ترمز"),
    },
    "retail": {
        "industry": "پوشاک و کفش",
        "categories": ("پوشاک", "کفش", "اکسسوری"),
        "products": ("پیراهن نخی", "کفش روزمره", "کمربند"),
    },
    "team": {
        "industry": "پخش و انبارداری",
        "categories": ("کالای تندگردش", "کالای حجیم", "مرجوعی"),
        "products": ("کارتن کالای پخش", "بسته عمده", "کالای انباری"),
    },
    "historical": {
        "industry": "فروشگاه دارای سابقه",
        "categories": ("کالای قدیمی", "کالای فعال", "کالای بایگانی"),
        "products": ("محصول باسابقه", "محصول فعال", "محصول قدیمی"),
    },
}

SECTOR_PROFILE_FIXTURES = {
    "tax-auto": {
        "sector_code": "01",
        "sector_name": "قطعات، لوازم و تجهیزات خودرو",
        "store_name": "فروشگاه آزمایشی تنظیم — خودرو (TAX-V2)",
        "base_price": 180_000,
        "price_step": 95_000,
    },
    "tax-apparel": {
        "sector_code": "11",
        "sector_name": "پوشاک، کیف، کفش و محصولات چرمی",
        "store_name": "فروشگاه آزمایشی تنظیم — پوشاک و کیف و کفش (TAX-V2)",
        "base_price": 250_000,
        "price_step": 120_000,
    },
    "tax-electronics": {
        "sector_code": "07",
        "sector_name": "موبایل و لوازم جانبی",
        "store_name": "فروشگاه آزمایشی تنظیم — الکترونیک و موبایل (TAX-V2)",
        "base_price": 450_000,
        "price_step": 850_000,
    },
    "tax-food": {
        "sector_code": "14",
        "sector_name": "مواد غذایی و محصولات سوپرمارکتی",
        "store_name": "فروشگاه آزمایشی تنظیم — مواد غذایی و سوپرمارکت (TAX-V2)",
        "base_price": 18_000,
        "price_step": 9_500,
    },
    "tax-tools": {
        "sector_code": "02",
        "sector_name": "ابزارآلات و تجهیزات صنعتی",
        "store_name": "فروشگاه آزمایشی تنظیم — ابزارآلات و تجهیزات فنی (TAX-V2)",
        "base_price": 120_000,
        "price_step": 190_000,
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
    sector_fixture = SECTOR_PROFILE_FIXTURES.get(key)
    if sector_fixture is not None:
        industry = db.scalar(select(Industry).where(Industry.sector_code == sector_fixture["sector_code"]))
        if industry is None or industry.taxonomy_version != active_taxonomy_version():
            raise RuntimeError(f"QA_SECTOR_INDUSTRY_MISSING:{sector_fixture['sector_code']}")
        return industry
    if key == "auto":
        industry = db.scalar(select(Industry).where(Industry.sector_code == "01"))
        if industry is None:
            raise RuntimeError("QA_AUTOMOTIVE_INDUSTRY_MISSING")
        return industry
    fixture = STORE_FIXTURES.get(key, {})
    name = f"آزمایشی {QA_NAMESPACE} {fixture.get('industry', key)}"
    industry = db.scalar(select(Industry).where(Industry.name == name))
    if industry is None:
        industry = Industry(name=name, description="داده مصنوعی و غیرقابل انتشار Gate 7", is_active=True)
        db.add(industry)
        db.flush()
    return industry


def _owner(
    db: Session,
    key: str,
    plan: str,
    password_hash: str,
    *,
    store_name: str | None = None,
    reset_password: bool = False,
) -> tuple[User, Store, StoreMembership]:
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
    if reset_password:
        user.hashed_password = password_hash
    user.plan = store.plan = plan
    store.name = (
        store_name
        or ("فروشگاه آزمایشی تنظیم — خودرو" if key == "auto" else f"مجموعه آزمایشی {QA_NAMESPACE} {key}")
    )
    return user, store, membership


def _seed_store(db: Session, key: str, plan: str, product_count: int, password_hash: str) -> dict[str, int]:
    if key in SECTOR_PROFILE_FIXTURES:
        return _seed_sector_store(db, key, product_count, password_hash)
    rich_automotive = key == "auto" and product_count >= 100
    owner, store, membership = _owner(db, key, plan, password_hash)
    industry = _industry(db, key)
    owner.industry_id = store.industry_id = industry.id

    if key == "auto":
        sector = db.scalar(select(ReferenceSector).where(ReferenceSector.code == "01"))
        if sector is None:
            raise RuntimeError("QA_AUTOMOTIVE_SECTOR_MISSING")
        store.taxonomy_version = active_taxonomy_version()
        store.taxonomy_adopted_at = store.taxonomy_adopted_at or datetime.now(timezone.utc)
        store.taxonomy_adopted_by_user_id = owner.id
        references = list(db.scalars(select(ReferenceCategory).where(
            ReferenceCategory.sector_id == sector.id,
            ReferenceCategory.approval_status == "approved",
        ).order_by(ReferenceCategory.code)))
        if len(references) != 25:
            raise RuntimeError("QA_AUTOMOTIVE_CATEGORY_COUNT_INVALID")
        for reference in references:
            category = db.scalar(select(Category).where(
                Category.store_id == store.id,
                Category.reference_key == reference.reference_key,
            ))
            if category is None:
                category = Category(
                    store_id=store.id, user_id=owner.id, name=reference.name_fa,
                    description="، ".join(json.loads(reference.examples_json)), code=reference.code,
                    sector_code="01", origin="system", approval_status="approved", is_active=True,
                    reference_key=reference.reference_key, reference_category_id=reference.id,
                    taxonomy_version=active_taxonomy_version(),
                )
                db.add(category)
        db.flush()

    if product_count == 0:
        db.flush()
        return {"stores": 1, "users": 1, "products": 0, "counterparties": 0, "invoices": 0, "barcodes": 0}

    categories: list[Category] = []
    fixture = STORE_FIXTURES.get(key, STORE_FIXTURES["auto"])
    if key == "auto":
        categories = list(db.scalars(select(Category).where(
            Category.store_id == store.id,
            Category.origin == "system",
        ).order_by(Category.code)))
    for index, name in enumerate(() if key == "auto" else fixture["categories"], start=1):
        scoped_name = f"{name} — {QA_NAMESPACE}-{key}"
        category_code = f"Q{index:02d}"
        # The store/code pair is the database identity. Fixture display names may
        # evolve between QA revisions, so name-based lookup is not convergent.
        category = db.scalar(select(Category).where(
            Category.store_id == store.id,
            Category.code == category_code,
        ))
        if category is None:
            category = Category(
                store_id=store.id, user_id=owner.id, name=scoped_name,
                description="دسته مصنوعی Gate 7", code=category_code,
                sector_code="99", origin="custom", approval_status="approved", is_active=True,
            )
            db.add(category)
            db.flush()
        else:
            category.name = scoped_name
            category.user_id = owner.id
            category.description = "دسته مصنوعی Gate 7"
            category.sector_code = "99"
            category.origin = "custom"
            category.approval_status = "approved"
            category.is_active = True
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
        selected_category = categories[((index - 1) if rich_automotive else index) % len(categories)]
        examples = [item.strip() for item in (selected_category.description or "").split("،") if item.strip()]
        product_name = (
            examples[(index - 1) % len(examples)] if rich_automotive and examples
            else fixture["products"][(index - 1) % len(fixture["products"])]
        )
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
                category_id=selected_category.id,
                quantity=quantity, price=sale_price, sale_price=sale_price,
                purchase_price=max(0, sale_price - 15_000),
                custom_label=("نام بسیار بلند محصول آزمایشی برای سنجش چیدمان رابط کاربری " if index == 2 else f"{product_name} ") + str(index),
                low_stock_threshold=5, low_stock_alert=0 < quantity <= 5,
                is_hidden=index % 19 == 0,
                note=f"{QA_NAMESPACE}:{key}:{index}",
            )
            item.labels.extend(labels[: 1 + (index % len(labels))])
            db.add(item)
            db.flush()
        products.append(item)

        if rich_automotive and index % 5 == 0:
            digest = hashlib.sha256(QA_WEBP).hexdigest()
            transfer_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{QA_NAMESPACE}:{key}:media:{index}"))
            asset_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{QA_NAMESPACE}:{key}:asset:{index}"))
            asset = db.get(MediaAsset, asset_id)
            if asset is None:
                storage_key = f"stores/{store.id}/{digest[:2]}/{digest}.webp"
                media_storage.put_if_absent(storage_key, QA_WEBP)
                asset = MediaAsset(
                    id=asset_id, store_id=store.id, actor_user_id=owner.id,
                    transfer_id=transfer_id, content_sha256=digest, storage_key=storage_key,
                    mime_type="image/webp", byte_size=len(QA_WEBP), width=1, height=1,
                )
                db.add(asset)
                db.flush()
            item.media_asset_id = asset.id

        if key == "auto" and (not rich_automotive or index % 4 != 0):
            existing_barcode = db.scalar(select(ProductBarcode).where(
                ProductBarcode.store_id == store.id,
                ProductBarcode.product_id == item.id,
            ))
            if existing_barcode is None:
                issue_internal_barcode(db, store, item, selected_category)
            continue

        barcode_value = f"QAUTO{_stable_int(identity):09d}{index % 10}" if rich_automotive else f"Q7{_stable_int(identity):09d}{index % 10}"
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
    party_specs = (
        tuple((f"supplier-{number:02d}", "organization") for number in range(1, 6))
        + tuple((f"customer-{number:02d}", "person") for number in range(1, 6))
        if rich_automotive else (("supplier", "organization"), ("customer", "person"))
    )
    for suffix, kind in party_specs:
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

    invoice_ages = (420, 370) if key == "historical" else (7, 0)
    invoice_specs = (
        tuple(
            ("purchase" if number % 2 else "sale", parties[(number - 1) % len(parties)], 21 - number, number)
            for number in range(1, 21)
        )
        if rich_automotive else (
            ("purchase", parties[0], invoice_ages[0], 1),
            ("sale", parties[1], invoice_ages[1], 1),
        )
    )
    for invoice_type, party, age, invoice_number in invoice_specs:
        operation_id = f"{QA_NAMESPACE}-{key}-{invoice_type}-{invoice_number:03d}"
        invoice = db.scalar(select(Invoice).where(
            Invoice.store_id == store.id, Invoice.post_operation_id == operation_id,
        ))
        start = ((invoice_number - 1) * 3) % len(products) if rich_automotive else 0
        chosen = products[start:start + min(3, len(products))]
        unit_prices = [p.purchase_price if invoice_type == "purchase" else p.sale_price for p in chosen]
        if invoice is None:
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
            db.add(StoreActivity(
                store_id=store.id, actor_user_id=owner.id, actor_membership_id=membership.id,
                actor_display_name=owner.username, actor_role_name="مالک", operation_id=operation_id,
                target_entity="invoice", target_id=str(invoice.id), action=f"invoice.{invoice_type}.posted",
                before_json=None, after_json=json.dumps({"total_amount": total}, ensure_ascii=False),
                outcome="applied", client_occurred_at=invoice.posted_at, accepted_at=invoice.posted_at,
            ))
        for position, (product, price) in enumerate(zip(chosen, unit_prices), start=1):
            final = product.quantity
            before = final if invoice_type == "purchase" else final + 2
            after = final + 2 if invoice_type == "purchase" else final
            line = db.scalar(select(InvoiceLine).where(
                InvoiceLine.invoice_id == invoice.id,
                InvoiceLine.product_id == product.id,
            ))
            if line is None:
                line = InvoiceLine(
                    invoice_id=invoice.id, store_id=store.id, product_id=product.id,
                    position=position, product_name=product.custom_label or product.catalog_product.name,
                    quantity=2, unit="عدد", pack_size=None, base_quantity=2,
                    unit_price=int(price or 0), line_total=int(price or 0) * 2,
                    before_quantity=before, after_quantity=after,
                )
                db.add(line)
                db.flush()
            line.position = position
            line.product_name = product.custom_label or product.catalog_product.name
            line.quantity = 2
            line.unit = "عدد"
            line.pack_size = None
            line.base_quantity = 2
            line.unit_price = int(price or 0)
            line.line_total = int(price or 0) * 2
            line.before_quantity = before
            line.after_quantity = after
            movement_operation_id = f"{operation_id}-line-{position}"
            movement = db.scalar(select(InventoryMovement).where(
                InventoryMovement.store_id == store.id,
                InventoryMovement.actor_user_id == owner.id,
                InventoryMovement.operation_id == movement_operation_id,
            ))
            if movement is None:
                db.add(InventoryMovement(
                    store_id=store.id, product_id=product.id,
                    actor_user_id=owner.id, actor_membership_id=membership.id,
                    operation_id=movement_operation_id,
                    kind="receive" if invoice_type == "purchase" else "issue",
                    delta=2 if invoice_type == "purchase" else -2,
                    correction_quantity=None, scan_source="manual",
                    barcode_id=None, barcode_value=None, scan_quantity=1,
                    before_quantity=before, after_quantity=after,
                    invoice_id=invoice.id, invoice_line_id=line.id,
                    client_occurred_at=invoice.posted_at,
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
    return {
        "stores": 1, "users": 2 if key == "team" else 1, "products": len(products),
        "counterparties": len(parties), "invoices": len(invoice_specs), "barcodes": len(products),
    }


def _seed_sector_store(db: Session, key: str, product_count: int, password_hash: str) -> dict[str, int]:
    fixture = SECTOR_PROFILE_FIXTURES[key]
    owner, store, membership = _owner(
        db,
        key,
        "vip",
        password_hash,
        store_name=fixture["store_name"],
        reset_password=True,
    )
    industry = _industry(db, key)
    owner.industry_id = store.industry_id = industry.id
    sector = db.scalar(select(ReferenceSector).where(
        ReferenceSector.code == fixture["sector_code"],
        ReferenceSector.taxonomy_version == active_taxonomy_version(),
    ))
    if sector is None:
        raise RuntimeError(f"QA_SECTOR_MISSING:{fixture['sector_code']}")
    references = list(db.scalars(select(ReferenceCategory).where(
        ReferenceCategory.sector_id == sector.id,
        ReferenceCategory.taxonomy_version == active_taxonomy_version(),
    ).order_by(ReferenceCategory.code)))
    if not references:
        raise RuntimeError(f"QA_SECTOR_CATEGORIES_MISSING:{fixture['sector_code']}")
    if any(reference.approval_status != "approved" for reference in references) and not proposed_taxonomy_enabled():
        raise RuntimeError("QA_PROPOSED_TAXONOMY_DISABLED")
    if fixture["sector_code"] == "01" and (
        len(references) != 25 or any(reference.approval_status != "approved" for reference in references)
    ):
        raise RuntimeError("QA_AUTOMOTIVE_CATEGORY_COUNT_INVALID")

    store.taxonomy_version = active_taxonomy_version()
    store.taxonomy_adopted_at = store.taxonomy_adopted_at or datetime.now(timezone.utc)
    store.taxonomy_adopted_by_user_id = owner.id
    store.taxonomy_policy_version = max(store.taxonomy_policy_version or 0, 1)

    categories: list[Category] = []
    for reference in references:
        description = "، ".join(json.loads(reference.examples_json))
        category = db.scalar(select(Category).where(
            Category.store_id == store.id,
            Category.reference_key == reference.reference_key,
        ))
        if category is None:
            category = Category(
                store_id=store.id, user_id=owner.id, name=reference.name_fa,
                description=description, code=reference.code, sector_code=sector.code,
                origin="system", approval_status=reference.approval_status, is_active=True,
                reference_key=reference.reference_key, reference_category_id=reference.id,
                taxonomy_version=active_taxonomy_version(),
            )
            db.add(category)
        else:
            category.name = reference.name_fa
            category.description = description
            category.code = reference.code
            category.sector_code = sector.code
            category.origin = "system"
            category.approval_status = reference.approval_status
            category.is_active = True
            category.reference_category_id = reference.id
            category.taxonomy_version = active_taxonomy_version()
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
    target = max(product_count, len(categories))
    for index in range(1, target + 1):
        identity = f"{QA_NAMESPACE}-{key}-product-{index:05d}"
        selected_category = categories[(index - 1) % len(categories)]
        examples = [item.strip() for item in (selected_category.description or "").split("،") if item.strip()]
        product_name = examples[(index - 1) % len(examples)] if examples else selected_category.name
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
        sale_price = fixture["base_price"] + index * fixture["price_step"]
        quantity = 0 if index % 7 == 0 else (2 if index % 5 == 0 else index + 4)
        if item is None:
            item = InventoryItem(
                store_id=store.id, user_id=owner.id, catalog_product_id=catalog.id,
                category_id=selected_category.id,
                quantity=quantity, price=sale_price, sale_price=sale_price,
                purchase_price=max(0, int(sale_price * 0.72)),
                custom_label=f"{product_name} {index}",
                low_stock_threshold=5, low_stock_alert=0 < quantity <= 5,
                is_hidden=index % 19 == 0,
                note=f"{QA_NAMESPACE}:{key}:{index}",
            )
            item.labels.extend(labels[: 1 + (index % len(labels))])
            db.add(item)
            db.flush()
        products.append(item)

        if index % 5 == 0:
            digest = hashlib.sha256(QA_WEBP).hexdigest()
            transfer_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{QA_NAMESPACE}:{key}:media:{index}"))
            asset_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{QA_NAMESPACE}:{key}:asset:{index}"))
            asset = db.get(MediaAsset, asset_id)
            if asset is None:
                storage_key = f"stores/{store.id}/{digest[:2]}/{digest}.webp"
                media_storage.put_if_absent(storage_key, QA_WEBP)
                asset = MediaAsset(
                    id=asset_id, store_id=store.id, actor_user_id=owner.id,
                    transfer_id=transfer_id, content_sha256=digest, storage_key=storage_key,
                    mime_type="image/webp", byte_size=len(QA_WEBP), width=1, height=1,
                )
                db.add(asset)
                db.flush()
            item.media_asset_id = asset.id

        existing_barcode = db.scalar(select(ProductBarcode).where(
            ProductBarcode.store_id == store.id,
            ProductBarcode.product_id == item.id,
        ))
        if existing_barcode is not None:
            continue
        if index % 4 == 0:
            barcode_value = f"QA{key.upper().replace('-', '')}{_stable_int(identity):09d}{index % 10}"
            reservation = db.scalar(select(BarcodeReservation).where(
                BarcodeReservation.store_id == store.id,
                BarcodeReservation.value == barcode_value,
            ))
            if reservation is None:
                reservation = BarcodeReservation(
                    store_id=store.id, value=barcode_value, target_type="product", target_id=item.id,
                    origin="external", status="active",
                    category_reference_key=selected_category.reference_key,
                )
                db.add(reservation)
                db.flush()
                db.add(ProductBarcode(
                    store_id=store.id, product_id=item.id, value=barcode_value,
                    source="manufacturer", symbology="code128", meaning="unit",
                    scan_quantity=1, is_active=True, is_default=True,
                    lifecycle_status="active", reservation_id=reservation.id,
                    category_reference_key=selected_category.reference_key,
                ))
        else:
            issue_internal_barcode(db, store, item, selected_category)

    parties: list[Counterparty] = []
    party_specs = (
        tuple((f"supplier-{number:02d}", "organization") for number in range(1, 6))
        + tuple((f"customer-{number:02d}", "person") for number in range(1, 6))
    )
    for suffix, kind in party_specs:
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

    invoice_count = 20
    available_products = list(products)
    for number in range(1, invoice_count + 1):
        invoice_type = "purchase" if number % 2 else "sale"
        party = parties[(number - 1) % len(parties)]
        operation_id = f"{QA_NAMESPACE}-{key}-{invoice_type}-{number:03d}"
        invoice = db.scalar(select(Invoice).where(
            Invoice.store_id == store.id, Invoice.post_operation_id == operation_id,
        ))
        eligible = [
            product for product in available_products
            if invoice_type == "sale" or product.quantity >= 2
        ]
        chosen = eligible[:2]
        if len(chosen) != 2:
            raise RuntimeError(f"QA_INVOICE_FIXTURE_CAPACITY_EXHAUSTED:{key}:{invoice_type}:{number}")
        chosen_ids = {product.id for product in chosen}
        available_products = [product for product in available_products if product.id not in chosen_ids]
        unit_prices = [p.purchase_price if invoice_type == "purchase" else p.sale_price for p in chosen]
        if invoice is None:
            total = sum(int(price or 0) * 2 for price in unit_prices)
            invoice = Invoice(
                id=_stable_int(operation_id),
                store_id=store.id, actor_user_id=owner.id, actor_membership_id=membership.id,
                invoice_type=invoice_type, title=f"فاکتور {invoice_type} آزمایشی",
                counterparty_id=party.id, counterparty=party.name, status="posted",
                total_amount=total, post_operation_id=operation_id,
                posted_at=datetime.now(timezone.utc) - timedelta(days=max(0, 21 - number)),
            )
            db.add(invoice)
            db.flush()
            db.add(StoreActivity(
                store_id=store.id, actor_user_id=owner.id, actor_membership_id=membership.id,
                actor_display_name=owner.username, actor_role_name="مالک", operation_id=operation_id,
                target_entity="invoice", target_id=str(invoice.id), action=f"invoice.{invoice_type}.posted",
                before_json=None, after_json=json.dumps({"total_amount": total}, ensure_ascii=False),
                outcome="applied", client_occurred_at=invoice.posted_at, accepted_at=invoice.posted_at,
            ))
        for position, (product, price) in enumerate(zip(chosen, unit_prices), start=1):
            final = product.quantity
            before = final - 2 if invoice_type == "purchase" else final + 2
            after = final
            line = db.scalar(select(InvoiceLine).where(
                InvoiceLine.invoice_id == invoice.id,
                InvoiceLine.product_id == product.id,
            ))
            if line is None:
                line = InvoiceLine(
                    invoice_id=invoice.id, store_id=store.id, product_id=product.id,
                    position=position, product_name=product.custom_label or product.catalog_product.name,
                    quantity=2, unit="عدد", pack_size=None, base_quantity=2,
                    unit_price=int(price or 0), line_total=int(price or 0) * 2,
                    before_quantity=before, after_quantity=after,
                )
                db.add(line)
                db.flush()
            line.position = position
            line.product_name = product.custom_label or product.catalog_product.name
            line.quantity = 2
            line.unit = "عدد"
            line.pack_size = None
            line.base_quantity = 2
            line.unit_price = int(price or 0)
            line.line_total = int(price or 0) * 2
            line.before_quantity = before
            line.after_quantity = after
            movement_operation_id = f"{operation_id}-line-{position}"
            movement = db.scalar(select(InventoryMovement).where(
                InventoryMovement.store_id == store.id,
                InventoryMovement.actor_user_id == owner.id,
                InventoryMovement.operation_id == movement_operation_id,
            ))
            if movement is None:
                db.add(InventoryMovement(
                    store_id=store.id, product_id=product.id,
                    actor_user_id=owner.id, actor_membership_id=membership.id,
                    operation_id=movement_operation_id,
                    kind="receive" if invoice_type == "purchase" else "issue",
                    delta=2 if invoice_type == "purchase" else -2,
                    correction_quantity=None, scan_source="manual",
                    barcode_id=None, barcode_value=None, scan_quantity=1,
                    before_quantity=before, after_quantity=after,
                    invoice_id=invoice.id, invoice_line_id=line.id,
                    client_occurred_at=invoice.posted_at,
                ))

    db.flush()
    return {
        "stores": 1, "users": 1, "products": len(products),
        "counterparties": len(parties), "invoices": invoice_count, "barcodes": len(products),
    }


def seed_profile(
    db: Session,
    profile: str,
    *,
    password: str,
    passwords: dict[str, str] | None = None,
    dry_run: bool = False,
    stress_size: int | None = None,
) -> SeedSummary:
    if profile == "stress":
        if stress_size not in {1000, 5000, 10000}:
            raise ValueError("QA_STRESS_SIZE_MUST_BE_1000_5000_OR_10000")
        specs = ((f"stress-{stress_size}", "vip", stress_size),)
    else:
        try:
            specs = PROFILE_SPECS[profile]["stores"]
        except KeyError as error:
            raise ValueError("QA_PROFILE_UNKNOWN") from error
    rich = {key for key, _, count in specs if (key == "auto" and count >= 100) or key in SECTOR_PROFILE_FIXTURES}
    expected = SeedSummary(
        profile=profile, stores=len(specs), users=sum(2 if key == "team" else 1 for key, _, _ in specs),
        products=sum(count for _, _, count in specs),
        counterparties=sum(10 if key in rich else 2 for key, _, count in specs if count > 0),
        invoices=sum(20 if key in rich else 2 for key, _, count in specs if count > 0),
        barcodes=sum(count for _, _, count in specs), dry_run=dry_run,
    )
    if dry_run:
        return expected
    if profile == "five_sector":
        if not proposed_taxonomy_enabled():
            raise RuntimeError("QA_PROPOSED_TAXONOMY_DISABLED_FOR_FIVE_SECTOR")
        missing = [key for key, _, _ in specs if key not in (passwords or {})]
        if missing:
            raise RuntimeError(f"QA_SEED_PASSWORDS_INCOMPLETE:{','.join(missing)}")
        if any(len(value) < 16 for value in passwords.values()):
            raise RuntimeError("QA_SEED_PASSWORD_TOO_SHORT")
    seed_canonical_taxonomy(db)
    totals = {"stores": 0, "users": 0, "products": 0, "counterparties": 0, "invoices": 0, "barcodes": 0}
    try:
        for key, plan, count in specs:
            password_hash = hash_password((passwords or {}).get(key, password))
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
