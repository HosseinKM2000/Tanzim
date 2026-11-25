import base64
import hashlib
import hmac
import json
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from ..models import CatalogProduct, CatalogProductFamily, CatalogProductMedia
from ..config import settings
from ..schemas import (
    CatalogProductCreate,
    CatalogProductUpdate,
)


def _search_patterns(search: str) -> list[str]:
    """Keep substring search compatible with common Persian/Arabic input forms."""
    value = " ".join(search.strip().split())
    persian = value.translate(str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک"}))
    arabic = value.translate(str.maketrans({"ی": "ي", "ک": "ك"}))
    forms = {value, persian, arabic}
    forms.update(form.replace("\u200c", " ") for form in tuple(forms))
    forms.update(form.replace("\u200c", "") for form in tuple(forms))
    return [f"%{form}%" for form in forms if form]


def _search_clause(search: str):
    return or_(*(
        column.ilike(pattern)
        for pattern in _search_patterns(search)
        for column in (CatalogProduct.name, CatalogProduct.brand, CatalogProduct.description)
    ))


def _catalog_load_options():
    options = [joinedload(CatalogProduct.industry)]
    if settings.CATALOG_REFERENCE_MEDIA_V1_ENABLED:
        options.append(
            selectinload(CatalogProduct.reference_media_links).joinedload(
                CatalogProductMedia.media_asset
            )
        )
        options.append(
            selectinload(CatalogProduct.family_links).joinedload(
                CatalogProductFamily.family
            )
        )
    return options


def _query_fingerprint(search: str | None, industry_id: int | None) -> str:
    normalized = {
        "industry_id": industry_id,
        "search": (search or "").strip().casefold(),
        "scope": "shared-active-created-desc-id-desc",
    }
    raw = json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()[:20]


def _encode_cursor(product: CatalogProduct, fingerprint: str) -> str:
    payload = {"v": 1, "t": product.created_at.isoformat(), "i": product.id, "q": fingerprint}
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    signature = hmac.new(settings.SECRET_KEY.encode(), body, hashlib.sha256).hexdigest()
    envelope = base64.urlsafe_b64encode(body).decode().rstrip("=")
    return f"{envelope}.{signature}"


def _decode_cursor(cursor: str, fingerprint: str) -> tuple[datetime, int]:
    try:
        encoded, signature = cursor.split(".", 1)
        body = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        expected = hmac.new(settings.SECRET_KEY.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        payload = json.loads(body)
        if payload.get("v") != 1 or payload.get("q") != fingerprint:
            raise ValueError
        created_at = datetime.fromisoformat(payload["t"])
        catalog_id = int(payload["i"])
        if catalog_id <= 0:
            raise ValueError
        return created_at, catalog_id
    except (TypeError, ValueError, KeyError, json.JSONDecodeError) as error:
        raise ValueError("CATALOG_CURSOR_INVALID") from error


def get_catalog_products_page(
    db: Session,
    *,
    search: str | None = None,
    industry_id: int | None = None,
    cursor: str | None = None,
    limit: int = 24,
):
    fingerprint = _query_fingerprint(search, industry_id)
    stmt = (
        select(CatalogProduct)
        .options(*_catalog_load_options())
        .where(CatalogProduct.is_shared.is_(True), CatalogProduct.is_active.is_(True))
    )
    if industry_id:
        stmt = stmt.where(CatalogProduct.industry_id == industry_id)
    if search and search.strip():
        stmt = stmt.where(_search_clause(search))
    if cursor:
        created_at, catalog_id = _decode_cursor(cursor, fingerprint)
        stmt = stmt.where(or_(
            CatalogProduct.created_at < created_at,
            and_(CatalogProduct.created_at == created_at, CatalogProduct.id < catalog_id),
        ))
    rows = list(db.scalars(stmt.order_by(CatalogProduct.created_at.desc(), CatalogProduct.id.desc()).limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return items, (_encode_cursor(items[-1], fingerprint) if has_more and items else None), has_more


def get_catalog_products(
    db: Session,
    search: str | None = None,
    industry_id: int | None = None,
    is_active: bool = True,
):
    stmt = (
        select(CatalogProduct)
        .options(*_catalog_load_options())
        .where(
            CatalogProduct.is_shared.is_(True),
            CatalogProduct.is_active.is_(is_active),
        )
    )

    if industry_id:
        stmt = stmt.where(
            CatalogProduct.industry_id == industry_id
        )

    if search and search.strip():
        stmt = stmt.where(_search_clause(search))

    stmt = stmt.order_by(
        CatalogProduct.created_at.desc(),
        CatalogProduct.id.desc(),
    )

    return list(db.scalars(stmt))


def get_catalog_product(
    db: Session,
    catalog_id: int,
):
    return db.scalar(
        select(CatalogProduct)
        .options(*_catalog_load_options())
        .where(
            CatalogProduct.id == catalog_id,
            CatalogProduct.is_shared.is_(True),
            CatalogProduct.is_active.is_(True),
        )
    )


def get_catalog_product_any_state(
    db: Session,
    catalog_id: int,
):
    return db.scalar(
        select(CatalogProduct)
        .options(*_catalog_load_options())
        .where(
            CatalogProduct.id == catalog_id,
            CatalogProduct.is_shared.is_(True),
        )
    )


def create_catalog_product(
    db: Session,
    payload: CatalogProductCreate,
):
    product = CatalogProduct(
        industry_id=payload.industry_id,
        name=payload.name,
        description=payload.description,
        brand=payload.brand,
        image_url=payload.image_url,
        is_packaged=payload.is_packaged,
        pack_size=payload.pack_size,
        is_shared=True,
        is_active=True,
    )

    db.add(product)
    db.flush()
    db.refresh(product)

    return product


def update_catalog_product(
    db: Session,
    product: CatalogProduct,
    payload: CatalogProductUpdate,
):
    data = payload.model_dump(exclude_unset=True)

    for key, value in data.items():
        setattr(product, key, value)

    db.flush()
    db.refresh(product)

    return product


def archive_catalog_product(
    db: Session,
    product: CatalogProduct,
):
    product.is_active = False
    db.flush()


def restore_catalog_product(
    db: Session,
    product: CatalogProduct,
):
    product.is_active = True
    db.flush()


def permanently_delete_catalog_product(
    db: Session,
    product: CatalogProduct,
) -> None:
    db.delete(product)
    db.flush()
