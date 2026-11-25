from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    BarcodeReservation,
    Category,
    Industry,
    InventoryItem,
    InventoryMovement,
    Invoice,
    ProductBarcode,
    ReferenceCategory,
    ReferenceSector,
    Store,
    StoreActivity,
    SyncChange,
    SyncOperation,
)
from ..schemas import InventoryOut


TAXONOMY_VERSION = "scb-2026-11-14-v1"
PROPOSED_QA_TAXONOMY_VERSION = "scb-2026-11-20-v2-proposed-qa"
INTERNAL_BARCODE_VERSION = "TZ1"
INTERNAL_BARCODE_SYMBOLOGY = "datamatrix"
INTERNAL_TOKEN_BYTES = 16
INTERNAL_TOKEN_LENGTH = 26
INTERNAL_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
MAX_RECATEGORIZATION_TARGETS = 100


def active_taxonomy_version() -> str:
    """Select a versioned reference source without changing the production default."""
    return settings.TAXONOMY_VERSION_OVERRIDE or TAXONOMY_VERSION


def proposed_taxonomy_enabled() -> bool:
    """Fail closed: proposed QA categories require qa/test + explicit version + flag."""
    return (
        settings.ENVIRONMENT in {"qa", "test"}
        and settings.QA_PROPOSED_TAXONOMY_ENABLED
        and bool(settings.TAXONOMY_VERSION_OVERRIDE)
        and active_taxonomy_version() != TAXONOMY_VERSION
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _store(db: Session, user, *, lock: bool = False) -> Store:
    statement = select(Store).where(Store.id == user.store_id)
    if lock:
        statement = statement.with_for_update()
    store = db.scalar(statement)
    if store is None:
        raise HTTPException(status_code=404, detail="STORE_NOT_FOUND")
    return store


def require_store_owner(user) -> None:
    if getattr(user, "is_store_owner", False) is not True:
        raise HTTPException(status_code=403, detail="STORE_OWNER_REQUIRED")


def legacy_preflight(db: Session, user) -> dict:
    store_id = user.store_id

    def evidence(model, *where) -> dict:
        count = db.scalar(select(func.count()).select_from(model).where(*where)) or 0
        ids = list(db.scalars(select(model.id).where(*where).order_by(model.id).limit(10)))
        return {"count": count, "record_ids": ids}

    products = evidence(InventoryItem, InventoryItem.store_id == store_id)
    uncategorized = evidence(
        InventoryItem,
        InventoryItem.store_id == store_id,
        InventoryItem.category_id.is_(None),
    )
    legacy_categories = evidence(
        Category,
        Category.store_id == store_id,
        Category.origin == "legacy",
    )
    unknown_barcodes = evidence(
        BarcodeReservation,
        BarcodeReservation.store_id == store_id,
        BarcodeReservation.origin == "legacy_unknown",
    )
    invoices = evidence(Invoice, Invoice.store_id == store_id)
    movements = evidence(InventoryMovement, InventoryMovement.store_id == store_id)
    pending_contract_work = evidence(SyncOperation, SyncOperation.store_id == store_id)
    return {
        "store_id": store_id,
        "taxonomy_version": _store(db, user).taxonomy_version,
        "products": products,
        "uncategorized_products": uncategorized,
        "legacy_categories": legacy_categories,
        "unknown_barcode_provenance": unknown_barcodes,
        "invoices": invoices,
        "movements": movements,
        "recorded_operations": pending_contract_work,
        "variants": {"status": "not_applicable", "reason": "NO_INDEPENDENT_VARIANT_MODEL"},
    }


def _store_has_usage(db: Session, store: Store) -> bool:
    if store.has_historical_inventory_usage:
        return True
    checks = (
        select(InventoryItem.id).where(InventoryItem.store_id == store.id).limit(1),
        select(Invoice.id).where(Invoice.store_id == store.id).limit(1),
        select(InventoryMovement.id).where(InventoryMovement.store_id == store.id).limit(1),
        select(BarcodeReservation.id).where(BarcodeReservation.store_id == store.id).limit(1),
        select(SyncOperation.id).where(SyncOperation.store_id == store.id).limit(1),
    )
    used = any(db.scalar(statement) is not None for statement in checks)
    if used:
        store.has_historical_inventory_usage = True
    return used


def list_reference_sectors(db: Session) -> list[ReferenceSector]:
    return list(db.scalars(
        select(ReferenceSector)
        .where(ReferenceSector.taxonomy_version == active_taxonomy_version())
        .order_by(ReferenceSector.code)
    ))


def list_reference_categories(db: Session, sector_code: str) -> list[ReferenceCategory]:
    """Expose approved reference parents; QA-proposed only through the QA gate."""
    statement = (
        select(ReferenceCategory)
        .join(ReferenceSector, ReferenceSector.id == ReferenceCategory.sector_id)
        .where(
            ReferenceSector.code == sector_code,
            ReferenceCategory.taxonomy_version == active_taxonomy_version(),
        )
        .order_by(ReferenceCategory.code)
    )
    if not proposed_taxonomy_enabled():
        statement = statement.where(ReferenceCategory.approval_status == "approved")
    return list(db.scalars(statement))


def adopt_store_taxonomy(db: Session, user, *, sector_code: str, expected_policy_version: int) -> Store:
    require_store_owner(user)
    store = _store(db, user, lock=True)
    if store.taxonomy_policy_version != expected_policy_version:
        raise HTTPException(status_code=409, detail="TAXONOMY_POLICY_VERSION_CONFLICT")
    sector = db.scalar(select(ReferenceSector).where(
        ReferenceSector.code == sector_code,
        ReferenceSector.taxonomy_version == active_taxonomy_version(),
    ))
    if sector is None:
        raise HTTPException(status_code=404, detail="REFERENCE_SECTOR_NOT_FOUND")
    industry = db.scalar(select(Industry).where(Industry.reference_sector_id == sector.id))
    if industry is None or industry.sector_code != sector.code:
        raise HTTPException(status_code=409, detail="SECTOR_INDUSTRY_MAPPING_REQUIRED")

    if store.taxonomy_version == active_taxonomy_version() and store.industry_id == industry.id:
        return store
    if _store_has_usage(db, store):
        raise HTTPException(status_code=409, detail="LEGACY_STORE_REVIEW_REQUIRED")

    store.industry_id = industry.id
    store.taxonomy_version = active_taxonomy_version()
    store.taxonomy_adopted_at = _now()
    store.taxonomy_adopted_by_user_id = user.id
    store.taxonomy_policy_version += 1
    user.industry_id = industry.id

    approved = list_reference_categories(db, sector.code)
    for reference in approved:
        existing = db.scalar(select(Category).where(
            Category.store_id == store.id,
            Category.reference_key == reference.reference_key,
        ))
        if existing is None:
            db.add(Category(
                store_id=store.id,
                user_id=user.data_owner_id,
                name=reference.name_fa,
                description="، ".join(json.loads(reference.examples_json)),
                code=reference.code,
                sector_code=sector.code,
                origin="system",
                approval_status=reference.approval_status,
                is_active=True,
                reference_key=reference.reference_key,
                reference_category_id=reference.id,
                taxonomy_version=active_taxonomy_version(),
            ))
    db.flush()
    return store


def _sector_for_store(db: Session, store: Store) -> ReferenceSector:
    industry = db.get(Industry, store.industry_id) if store.industry_id is not None else None
    sector = db.get(ReferenceSector, industry.reference_sector_id) if industry and industry.reference_sector_id else None
    if sector is None or industry.sector_code != sector.code:
        raise HTTPException(status_code=409, detail="STORE_SECTOR_MAPPING_INVALID")
    return sector


def validate_category_for_new_intent(db: Session, store: Store, category_id: int | None) -> Category | None:
    if store.taxonomy_version != active_taxonomy_version():
        if category_id is None:
            return None
        category = db.get(Category, category_id)
        if category is None or category.store_id != store.id:
            raise HTTPException(status_code=400, detail="CATEGORY_NOT_AVAILABLE")
        return category
    if category_id is None:
        raise HTTPException(status_code=422, detail="CATEGORY_REQUIRED_AFTER_ADOPTION")
    category = db.get(Category, category_id)
    if category is None or category.store_id != store.id or not category.is_active:
        raise HTTPException(status_code=400, detail="CATEGORY_NOT_AVAILABLE")
    sector = _sector_for_store(db, store)
    if category.sector_code != sector.code:
        raise HTTPException(status_code=400, detail="CATEGORY_SECTOR_MISMATCH")
    if category.origin == "system":
        reference = db.get(ReferenceCategory, category.reference_category_id)
        allowed_status = {"approved", "proposed"} if proposed_taxonomy_enabled() else {"approved"}
        if (
            reference is None
            or reference.approval_status not in allowed_status
            or reference.reference_key != category.reference_key
        ):
            raise HTTPException(status_code=400, detail="CATEGORY_REFERENCE_NOT_APPROVED")
    elif category.origin == "custom":
        if not sector.custom_categories_allowed:
            raise HTTPException(status_code=403, detail="CUSTOM_CATEGORY_FORBIDDEN_FOR_SECTOR")
    else:
        raise HTTPException(status_code=400, detail="LEGACY_CATEGORY_NOT_AVAILABLE_FOR_NEW_INTENT")
    return category


def custom_category_code() -> str:
    return "C" + base64.b32encode(secrets.token_bytes(8)).decode("ascii").rstrip("=")


def internal_barcode_value(sector_code: str, category_code: str) -> str:
    source = secrets.token_bytes(INTERNAL_TOKEN_BYTES)
    bits = 0
    buffer = 0
    encoded: list[str] = []
    for byte in source:
        buffer = (buffer << 8) | byte
        bits += 8
        while bits >= 5:
            bits -= 5
            encoded.append(INTERNAL_ALPHABET[(buffer >> bits) & 31])
    if bits:
        encoded.append(INTERNAL_ALPHABET[(buffer << (5 - bits)) & 31])
    token = "".join(encoded)
    if len(token) != INTERNAL_TOKEN_LENGTH:
        raise RuntimeError("INTERNAL_BARCODE_ENTROPY_INVALID")
    return f"{INTERNAL_BARCODE_VERSION}-{sector_code}-{category_code}-{token}"


def issue_internal_barcode(
    db: Session,
    store: Store,
    product: InventoryItem,
    category: Category,
    *,
    requested_value: str | None = None,
    requested_barcode_id: int | None = None,
) -> ProductBarcode:
    if not category.code or not category.sector_code:
        raise HTTPException(status_code=409, detail="CATEGORY_BARCODE_NAMESPACE_MISSING")
    if db.scalar(select(Store.id).where(Store.id == store.id).with_for_update()) is None:
        raise HTTPException(status_code=404, detail="STORE_NOT_FOUND")
    expected_pattern = rf"{INTERNAL_BARCODE_VERSION}-{re.escape(category.sector_code)}-{re.escape(category.code)}-[0-9A-HJKMNP-TV-Z]{{26}}"
    if requested_value is not None and re.fullmatch(expected_pattern, requested_value) is None:
        raise HTTPException(status_code=422, detail="INTERNAL_BARCODE_FORMAT_INVALID")
    attempts = 1 if requested_value is not None else 8
    for _ in range(attempts):
        value = requested_value or internal_barcode_value(category.sector_code, category.code)
        if db.scalar(select(BarcodeReservation.id).where(
            BarcodeReservation.store_id == store.id,
            BarcodeReservation.value == value,
        )) is not None:
            continue
        reservation = BarcodeReservation(
            store_id=store.id,
            value=value,
            target_type="product",
            target_id=product.id,
            origin="internal",
            status="active",
            category_reference_key=category.reference_key,
        )
        db.add(reservation)
        db.flush()
        barcode = ProductBarcode(
            id=requested_barcode_id,
            store_id=store.id,
            product_id=product.id,
            value=value,
            source="tanzim",
            symbology=INTERNAL_BARCODE_SYMBOLOGY,
            meaning="unit",
            scan_quantity=1,
            is_active=True,
            is_default=True,
            lifecycle_status="active",
            reservation_id=reservation.id,
            category_reference_key=category.reference_key,
        )
        db.add(barcode)
        db.flush()
        return barcode
    raise HTTPException(status_code=409, detail="INTERNAL_BARCODE_COLLISION_REVIEW_REQUIRED")


def reserve_external_barcode(
    db: Session, *, store_id: int, product_id: int, value: str, category_reference_key: str | None = None
) -> BarcodeReservation:
    # A store-row lock makes the select/insert reservation protocol safe on
    # PostgreSQL and shares the same serialization boundary as adoption and
    # first product creation.
    if db.scalar(select(Store.id).where(Store.id == store_id).with_for_update()) is None:
        raise ValueError("STORE_NOT_FOUND")
    existing = db.scalar(select(BarcodeReservation).where(
        BarcodeReservation.store_id == store_id,
        BarcodeReservation.value == value,
    ))
    if existing is not None:
        if existing.target_type == "product" and existing.target_id == product_id:
            return existing
        raise ValueError("BARCODE_ALREADY_RESERVED")
    reservation = BarcodeReservation(
        store_id=store_id,
        value=value,
        target_type="product",
        target_id=product_id,
        origin="external",
        status="active",
        category_reference_key=category_reference_key,
    )
    db.add(reservation)
    db.flush()
    return reservation


def resolve_barcode(db: Session, user, value: str) -> dict:
    reservation = db.scalar(select(BarcodeReservation).where(
        BarcodeReservation.store_id == user.store_id,
        BarcodeReservation.value == value,
    ))
    if reservation is None:
        return {"status": "not_found", "value": value}
    if reservation.status == "retired":
        return {"status": "retired", "value": value, "target_id": reservation.target_id}
    if reservation.status == "deleted":
        return {"status": "unavailable", "value": value}
    product = db.scalar(select(InventoryItem).where(
        InventoryItem.id == reservation.target_id,
        InventoryItem.store_id == user.store_id,
    ))
    if product is None or product.deleted_at is not None:
        return {"status": "unavailable", "value": value}
    barcode = db.scalar(select(ProductBarcode).where(
        ProductBarcode.reservation_id == reservation.id,
        ProductBarcode.lifecycle_status == "active",
    ))
    if barcode is None:
        return {"status": "unavailable", "value": value}
    return {
        "status": "active",
        "value": value,
        "target_id": product.id,
        "barcode_id": barcode.id,
        "product_version": product.version,
    }


def _preview_payload(*, store_id: int, destination_category_id: int, targets: list[dict], expires_at: str) -> dict:
    return {
        "store_id": store_id,
        "destination_category_id": destination_category_id,
        "targets": targets,
        "expires_at": expires_at,
    }


def _confirmation_token(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hmac.new(settings.SECRET_KEY.encode(), encoded, hashlib.sha256).hexdigest()


def preview_recategorization(db: Session, user, *, product_ids: list[int], destination_category_id: int) -> dict:
    unique_ids = list(dict.fromkeys(product_ids))
    if not unique_ids or len(unique_ids) > MAX_RECATEGORIZATION_TARGETS:
        raise HTTPException(status_code=422, detail="RECATEGORIZATION_SCOPE_INVALID")
    store = _store(db, user)
    destination = validate_category_for_new_intent(db, store, destination_category_id)
    products = list(db.scalars(select(InventoryItem).where(
        InventoryItem.store_id == store.id,
        InventoryItem.id.in_(unique_ids),
        InventoryItem.deleted_at.is_(None),
    ).order_by(InventoryItem.id)))
    if len(products) != len(unique_ids):
        raise HTTPException(status_code=404, detail="RECATEGORIZATION_TARGET_NOT_FOUND")
    targets = []
    for product in products:
        internal_count = db.scalar(select(func.count(ProductBarcode.id)).where(
            ProductBarcode.store_id == store.id,
            ProductBarcode.product_id == product.id,
            ProductBarcode.source == "tanzim",
            ProductBarcode.lifecycle_status == "active",
        )) or 0
        targets.append({
            "product_id": product.id,
            "version": product.version,
            "current_category_id": product.category_id,
            "internal_labels_to_replace": internal_count,
        })
    expires_at = (_now() + timedelta(minutes=10)).isoformat()
    payload = _preview_payload(
        store_id=store.id,
        destination_category_id=destination.id,
        targets=targets,
        expires_at=expires_at,
    )
    return {**payload, "confirmation_token": _confirmation_token(payload)}


def confirm_recategorization(
    db: Session,
    user,
    *,
    destination_category_id: int,
    targets: list[dict],
    expires_at: str,
    confirmation_token: str,
    operation_id: str,
) -> dict:
    store = _store(db, user, lock=True)
    payload = _preview_payload(
        store_id=store.id,
        destination_category_id=destination_category_id,
        targets=targets,
        expires_at=expires_at,
    )
    if not hmac.compare_digest(_confirmation_token(payload), confirmation_token):
        raise HTTPException(status_code=409, detail="RECATEGORIZATION_CONFIRMATION_INVALID")
    try:
        if datetime.fromisoformat(expires_at) <= _now():
            raise HTTPException(status_code=409, detail="RECATEGORIZATION_CONFIRMATION_EXPIRED")
    except ValueError as error:
        raise HTTPException(status_code=409, detail="RECATEGORIZATION_CONFIRMATION_INVALID") from error

    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    previous = db.scalar(select(SyncOperation).where(
        SyncOperation.store_id == store.id,
        SyncOperation.actor_user_id == user.id,
        SyncOperation.operation_id == operation_id,
    ))
    if previous is not None:
        if previous.request_fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail="OPERATION_ID_PAYLOAD_MISMATCH")
        return json.loads(previous.result_payload)

    destination = validate_category_for_new_intent(db, store, destination_category_id)
    target_by_id = {int(target["product_id"]): target for target in targets}
    products = list(db.scalars(select(InventoryItem).where(
        InventoryItem.store_id == store.id,
        InventoryItem.id.in_(target_by_id),
    ).with_for_update().order_by(InventoryItem.id)))
    if len(products) != len(target_by_id):
        raise HTTPException(status_code=409, detail="RECATEGORIZATION_PREVIEW_STALE")

    replacements = []
    for product in products:
        expected = target_by_id[product.id]
        if product.version != int(expected["version"]) or product.category_id != expected.get("current_category_id"):
            raise HTTPException(status_code=409, detail="RECATEGORIZATION_PREVIEW_STALE")
        internal = list(db.scalars(select(ProductBarcode).where(
            ProductBarcode.store_id == store.id,
            ProductBarcode.product_id == product.id,
            ProductBarcode.source == "tanzim",
            ProductBarcode.lifecycle_status == "active",
        ).with_for_update()))
        if len(internal) != int(expected["internal_labels_to_replace"]):
            raise HTTPException(status_code=409, detail="RECATEGORIZATION_PREVIEW_STALE")
        if product.category_id == destination.id:
            raise HTTPException(status_code=409, detail="RECATEGORIZATION_CATEGORY_UNCHANGED")
        product.category_id = destination.id
        product.version += 1
        replacement = issue_internal_barcode(db, store, product, destination) if internal else None
        replacements.append({"product_id": product.id, "barcode": replacement.value if replacement else None})
        for old in internal:
            old.is_active = False
            old.is_default = False
            old.lifecycle_status = "retired"
            old.version += 1
            reservation = db.get(BarcodeReservation, old.reservation_id)
            if reservation is not None:
                reservation.status = "retired"
                reservation.retired_at = _now()
                reservation.replaced_by_reservation_id = replacement.reservation_id if replacement else None

    result = {"status": "applied", "operation_id": operation_id, "replacements": replacements}
    db.flush()
    for product in products:
        db.add(SyncChange(
            store_id=store.id,
            actor_user_id=user.id,
            user_id=user.data_owner_id,
            entity="product",
            entity_id=product.id,
            operation="UPSERT",
            payload=json.dumps(InventoryOut.model_validate(product).model_dump(mode="json")),
        ))
    db.add(SyncOperation(
        store_id=store.id,
        actor_user_id=user.id,
        user_id=user.data_owner_id,
        operation_id=operation_id,
        request_fingerprint=fingerprint,
        execution_mode=store.operating_mode,
        policy_version=store.policy_version,
        result_payload=json.dumps(result, ensure_ascii=False),
    ))
    db.add(StoreActivity(
        store_id=store.id,
        actor_user_id=user.id,
        actor_membership_id=user.membership_id,
        actor_display_name=user.username,
        actor_role_name="مالک" if user.is_store_owner else "همکار",
        operation_id=operation_id,
        target_entity="product",
        target_id=",".join(str(item.id) for item in products),
        action="product.recategorized",
        before_json=None,
        after_json=json.dumps({"destination_category_id": destination.id, "count": len(products)}),
        outcome="applied",
        accepted_at=_now(),
    ))
    return result
