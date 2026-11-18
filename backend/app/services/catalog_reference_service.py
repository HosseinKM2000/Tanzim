import hashlib
import io
import json
import uuid
import warnings
from datetime import datetime, timezone

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    CatalogFamily,
    CatalogProduct,
    CatalogProductFamily,
    CatalogProductMedia,
    CatalogRelease,
    CatalogReleasePointer,
    Industry,
    ReferenceMediaAsset,
    User,
)
from ..reference_storage import reference_asset_storage
from ..schemas import CatalogFamilyCreate
from .audit_service import record_admin_action


ALLOWED_IMAGE_FORMATS = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
Image.MAX_IMAGE_PIXELS = settings.REFERENCE_ASSET_MAX_PIXELS


def require_reference_media_enabled() -> None:
    if not settings.CATALOG_REFERENCE_MEDIA_V1_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CATALOG_REFERENCE_MEDIA_V1_DISABLED",
        )


def create_family(db: Session, payload: CatalogFamilyCreate, actor: User) -> CatalogFamily:
    require_reference_media_enabled()
    if db.get(Industry, payload.industry_id) is None:
        raise HTTPException(status_code=404, detail="INDUSTRY_NOT_FOUND")
    family = CatalogFamily(**payload.model_dump(), is_active=True)
    db.add(family)
    try:
        db.flush()
        record_admin_action(
            db, actor, "catalog.family_created",
            metadata={"family_id": family.id, "industry_id": family.industry_id, "slug": family.slug},
        )
        db.commit()
        db.refresh(family)
        return family
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="CATALOG_FAMILY_EXISTS") from error


def list_families(db: Session, industry_id: int) -> list[CatalogFamily]:
    require_reference_media_enabled()
    return list(db.scalars(
        select(CatalogFamily)
        .where(CatalogFamily.industry_id == industry_id, CatalogFamily.is_active.is_(True))
        .order_by(CatalogFamily.sort_order, CatalogFamily.id)
    ))


def link_product_family(
    db: Session, family_id: int, product_id: int, actor: User
) -> CatalogFamily:
    require_reference_media_enabled()
    family = db.get(CatalogFamily, family_id)
    product = db.get(CatalogProduct, product_id)
    if family is None or product is None or not product.is_shared:
        raise HTTPException(status_code=404, detail="CATALOG_REFERENCE_NOT_FOUND")
    if family.industry_id != product.industry_id:
        raise HTTPException(status_code=409, detail="CATALOG_FAMILY_INDUSTRY_MISMATCH")
    if db.get(CatalogProductFamily, (product.id, family.id)) is None:
        db.add(CatalogProductFamily(catalog_product_id=product.id, catalog_family_id=family.id))
        record_admin_action(
            db, actor, "catalog.family_product_linked",
            metadata={"family_id": family.id, "catalog_product_id": product.id},
        )
        db.commit()
    return family


def _decode_image(content: bytes, declared_mime: str) -> Image.Image:
    if not content:
        raise HTTPException(status_code=422, detail="REFERENCE_IMAGE_EMPTY")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(io.BytesIO(content))
            detected_mime = ALLOWED_IMAGE_FORMATS.get(probe.format or "")
            if detected_mime is None or detected_mime != declared_mime:
                raise HTTPException(status_code=415, detail="REFERENCE_IMAGE_TYPE_INVALID")
            width, height = probe.size
            if width < 1 or height < 1 or width * height > settings.REFERENCE_ASSET_MAX_PIXELS:
                raise HTTPException(status_code=422, detail="REFERENCE_IMAGE_DIMENSIONS_INVALID")
            if getattr(probe, "n_frames", 1) != 1:
                raise HTTPException(status_code=422, detail="REFERENCE_IMAGE_ANIMATION_UNSUPPORTED")
            probe.verify()
            decoded = Image.open(io.BytesIO(content))
            decoded.load()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=422, detail="REFERENCE_IMAGE_DIMENSIONS_INVALID")
    except (UnidentifiedImageError, OSError, SyntaxError) as error:
        raise HTTPException(status_code=422, detail="REFERENCE_IMAGE_CORRUPT") from error
    return ImageOps.exif_transpose(decoded)


def _variant_bytes(image: Image.Image, max_dimension: int) -> tuple[bytes, int, int]:
    clean = image.convert("RGBA" if image.mode in {"RGBA", "LA"} else "RGB")
    clean.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    clean.save(
        output,
        format="WEBP",
        quality=settings.REFERENCE_ASSET_WEBP_QUALITY,
        method=6,
        exact=True,
    )
    return output.getvalue(), clean.width, clean.height


def _asset_dict(asset: ReferenceMediaAsset) -> dict:
    return {
        "id": asset.id,
        "source_sha256": asset.source_sha256,
        "content_sha256": asset.content_sha256,
        "mime_type": asset.mime_type,
        "width": asset.width,
        "height": asset.height,
        "byte_size": asset.byte_size,
        "variant_type": asset.variant_type,
        "validation_status": asset.validation_status,
        "created_at": asset.created_at,
        "read_url": f"/api/catalog-reference-assets/{asset.id}",
    }


def _link_assets(db: Session, product: CatalogProduct, assets: list[ReferenceMediaAsset]) -> None:
    for asset in assets:
        link = db.scalar(select(CatalogProductMedia).where(
            CatalogProductMedia.catalog_product_id == product.id,
            CatalogProductMedia.role == asset.variant_type,
        ))
        if link is None:
            db.add(CatalogProductMedia(
                catalog_product_id=product.id,
                media_asset_id=asset.id,
                role=asset.variant_type,
                sort_order=0,
            ))
        else:
            link.media_asset_id = asset.id


def ingest_reference_image(
    db: Session,
    *,
    product_id: int,
    content: bytes,
    declared_mime: str,
    source_reference: str,
    rights_confirmed: bool,
    actor: User,
) -> dict:
    require_reference_media_enabled()
    if not rights_confirmed or not source_reference.strip():
        raise HTTPException(status_code=422, detail="REFERENCE_SOURCE_APPROVAL_REQUIRED")
    if len(content) > settings.REFERENCE_ASSET_MAX_INPUT_BYTES:
        raise HTTPException(status_code=413, detail="REFERENCE_IMAGE_TOO_LARGE")
    product = db.get(CatalogProduct, product_id)
    if product is None or not product.is_shared or not product.is_active:
        raise HTTPException(status_code=404, detail="CATALOG_PRODUCT_NOT_FOUND")
    # Validation always precedes deduplication so a forged MIME declaration or
    # corrupt payload cannot be accepted merely because its bytes were seen.
    image = _decode_image(content, declared_mime)
    source_hash = hashlib.sha256(content).hexdigest()
    existing = list(db.scalars(
        select(ReferenceMediaAsset)
        .where(ReferenceMediaAsset.source_sha256 == source_hash)
        .order_by(ReferenceMediaAsset.variant_type)
    ))
    if {asset.variant_type for asset in existing} == {"preview", "detail"}:
        try:
            for asset in existing:
                reference_asset_storage.verified_blob(
                    asset.storage_key, asset.content_sha256, asset.byte_size
                )
        except (FileNotFoundError, ValueError) as error:
            raise HTTPException(status_code=503, detail="REFERENCE_ASSET_BYTES_UNAVAILABLE") from error
        _link_assets(db, product, existing)
        db.commit()
        return {"source_sha256": source_hash, "deduplicated": True, "assets": [_asset_dict(a) for a in existing]}

    generated: list[ReferenceMediaAsset] = []
    for variant, max_px in (
        ("preview", settings.REFERENCE_ASSET_PREVIEW_MAX_PX),
        ("detail", settings.REFERENCE_ASSET_DETAIL_MAX_PX),
    ):
        variant_content, width, height = _variant_bytes(image, max_px)
        content_hash = hashlib.sha256(variant_content).hexdigest()
        storage_key = f"blobs/{content_hash[:2]}/{content_hash}.webp"
        reference_asset_storage.put_blob_if_absent(storage_key, variant_content)
        asset = ReferenceMediaAsset(
            id=str(uuid.uuid4()),
            source_sha256=source_hash,
            content_sha256=content_hash,
            mime_type="image/webp",
            width=width,
            height=height,
            byte_size=len(variant_content),
            storage_key=storage_key,
            variant_type=variant,
            validation_status="approved",
            source_reference=source_reference.strip(),
            created_by_user_id=actor.id,
        )
        db.add(asset)
        generated.append(asset)
    try:
        db.flush()
        _link_assets(db, product, generated)
        record_admin_action(
            db, actor, "catalog.reference_media_ingested",
            metadata={"catalog_product_id": product.id, "source_sha256": source_hash},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        concurrent = list(db.scalars(select(ReferenceMediaAsset).where(
            ReferenceMediaAsset.source_sha256 == source_hash
        )))
        if {asset.variant_type for asset in concurrent} != {"preview", "detail"}:
            raise
        _link_assets(db, product, concurrent)
        db.commit()
        generated = concurrent
        return {"source_sha256": source_hash, "deduplicated": True, "assets": [_asset_dict(a) for a in generated]}
    for asset in generated:
        db.refresh(asset)
    return {"source_sha256": source_hash, "deduplicated": False, "assets": [_asset_dict(a) for a in generated]}


def _canonical_json(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sealed_manifest(value: dict) -> tuple[bytes, str]:
    content_hash = hashlib.sha256(_canonical_json(value)).hexdigest()
    sealed = {**value, "content_hash": content_hash}
    return _canonical_json(sealed), content_hash


def _release_files(db: Session, release: CatalogRelease) -> dict[str, bytes]:
    families = list(db.scalars(
        select(CatalogFamily)
        .where(CatalogFamily.industry_id == release.industry_id, CatalogFamily.is_active.is_(True))
        .order_by(CatalogFamily.sort_order, CatalogFamily.id)
    ))
    links = db.execute(
        select(CatalogProductFamily.catalog_family_id, CatalogProduct)
        .join(CatalogProduct, CatalogProduct.id == CatalogProductFamily.catalog_product_id)
        .where(
            CatalogProductFamily.catalog_family_id.in_([family.id for family in families] or [-1]),
            CatalogProduct.is_shared.is_(True),
            CatalogProduct.is_active.is_(True),
            CatalogProduct.industry_id == release.industry_id,
        )
        .order_by(CatalogProductFamily.catalog_family_id, CatalogProduct.id)
    ).all()
    product_ids = {product.id for _, product in links}
    media_rows = db.execute(
        select(CatalogProductMedia.catalog_product_id, CatalogProductMedia.role, ReferenceMediaAsset)
        .join(ReferenceMediaAsset, ReferenceMediaAsset.id == CatalogProductMedia.media_asset_id)
        .where(
            CatalogProductMedia.catalog_product_id.in_(product_ids or [-1]),
            ReferenceMediaAsset.validation_status == "approved",
        )
        .order_by(CatalogProductMedia.catalog_product_id, CatalogProductMedia.role)
    ).all()
    media_by_product: dict[int, dict[str, ReferenceMediaAsset]] = {}
    checked_storage_keys: set[str] = set()
    for product_id, role, asset in media_rows:
        if asset.storage_key not in checked_storage_keys:
            try:
                reference_asset_storage.verified_blob(
                    asset.storage_key, asset.content_sha256, asset.byte_size
                )
            except (FileNotFoundError, ValueError) as error:
                raise HTTPException(status_code=409, detail="REFERENCE_ASSET_BYTES_UNAVAILABLE") from error
            checked_storage_keys.add(asset.storage_key)
        media_by_product.setdefault(product_id, {})[role] = asset

    generated_at = release.created_at.astimezone(timezone.utc).isoformat()
    products_by_family: dict[int, list[CatalogProduct]] = {family.id: [] for family in families}
    for family_id, product in links:
        products_by_family[family_id].append(product)
    files: dict[str, bytes] = {}
    family_index: list[dict] = []
    for family in families:
        products = []
        unique_assets: dict[str, ReferenceMediaAsset] = {}
        for product in products_by_family[family.id]:
            assets = media_by_product.get(product.id, {})
            asset_values = {}
            for role in ("preview", "detail"):
                asset = assets.get(role)
                if asset is None:
                    asset_values[role] = None
                    continue
                unique_assets[asset.id] = asset
                asset_values[role] = {
                    "asset_id": asset.id,
                    "content_hash": asset.content_sha256,
                    "storage_key": asset.storage_key,
                    "width": asset.width,
                    "height": asset.height,
                    "byte_size": asset.byte_size,
                }
            products.append({
                "id": product.id,
                "name": product.name,
                "brand": product.brand,
                "description": product.description,
                "preview": asset_values["preview"],
                "detail": asset_values["detail"],
            })
        manifest = {
            "schema_version": 1,
            "industry_id": release.industry_id,
            "family_id": family.id,
            "family_slug": family.slug,
            "release_id": release.id,
            "release_version": release.version,
            "generated_at": generated_at,
            "product_count": len(products),
            "asset_count": len(unique_assets),
            "total_bytes": sum(asset.byte_size for asset in unique_assets.values()),
            "products": products,
        }
        content, content_hash = _sealed_manifest(manifest)
        relative = f"families/{family.slug}.json"
        files[relative] = content
        family_index.append({
            "family_id": family.id,
            "slug": family.slug,
            "manifest_path": relative,
            "manifest_hash": content_hash,
            "product_count": len(products),
        })
    index_content, _ = _sealed_manifest({
        "schema_version": 1,
        "industry_id": release.industry_id,
        "release_id": release.id,
        "release_version": release.version,
        "generated_at": generated_at,
        "families": family_index,
    })
    files["index.json"] = index_content
    return files


def publish_catalog(db: Session, request_id: str, industry_id: int, actor: User) -> CatalogRelease:
    require_reference_media_enabled()
    try:
        normalized_request = str(uuid.UUID(request_id))
    except ValueError as error:
        raise HTTPException(status_code=422, detail="CATALOG_RELEASE_REQUEST_INVALID") from error
    existing = db.scalar(select(CatalogRelease).where(CatalogRelease.request_id == normalized_request))
    if existing is not None:
        if existing.industry_id != industry_id:
            raise HTTPException(status_code=409, detail="CATALOG_RELEASE_REQUEST_MISMATCH")
        if existing.status == "published":
            return existing
        if existing.status == "failed":
            raise HTTPException(status_code=409, detail="CATALOG_RELEASE_FAILED")
        release = existing
    else:
        industry = db.scalar(select(Industry).where(Industry.id == industry_id).with_for_update())
        if industry is None:
            raise HTTPException(status_code=404, detail="INDUSTRY_NOT_FOUND")
        pointer = db.get(CatalogReleasePointer, industry_id)
        version = (db.scalar(select(func.max(CatalogRelease.version)).where(
            CatalogRelease.industry_id == industry_id
        )) or 0) + 1
        release = CatalogRelease(
            id=str(uuid.uuid4()),
            request_id=normalized_request,
            industry_id=industry_id,
            version=version,
            status="staging",
            previous_release_id=pointer.release_id if pointer else None,
            created_by_user_id=actor.id,
        )
        db.add(release)
        db.commit()
        db.refresh(release)

    try:
        if release.manifest_hash and release.manifest_path:
            try:
                index_bytes = reference_asset_storage.path_for(release.manifest_path).read_bytes()
            except FileNotFoundError:
                files = _release_files(db, release)
                index_bytes = files["index.json"]
                if hashlib.sha256(index_bytes).hexdigest() != release.manifest_hash:
                    raise HTTPException(status_code=409, detail="CATALOG_RELEASE_INPUT_STALE")
                reference_asset_storage.publish_release(release.id, files)
            if hashlib.sha256(index_bytes).hexdigest() != release.manifest_hash:
                raise HTTPException(status_code=409, detail="CATALOG_MANIFEST_TAMPERED")
        else:
            files = _release_files(db, release)
            index_bytes = files["index.json"]
            index_hash = hashlib.sha256(index_bytes).hexdigest()
            release.manifest_path = f"releases/{release.id}/index.json"
            release.manifest_hash = index_hash
            db.commit()
            reference_asset_storage.publish_release(release.id, files)
            if hashlib.sha256(reference_asset_storage.path_for(release.manifest_path).read_bytes()).hexdigest() != index_hash:
                raise HTTPException(status_code=409, detail="CATALOG_MANIFEST_TAMPERED")

        db.scalar(select(Industry).where(Industry.id == industry_id).with_for_update())
        pointer = db.get(CatalogReleasePointer, industry_id)
        current_id = pointer.release_id if pointer else None
        if current_id != release.previous_release_id:
            raise HTTPException(status_code=409, detail="CATALOG_RELEASE_POINTER_STALE")
        if pointer is None:
            db.add(CatalogReleasePointer(industry_id=industry_id, release_id=release.id))
        else:
            pointer.release_id = release.id
        if current_id:
            previous = db.get(CatalogRelease, current_id)
            if previous:
                previous.status = "superseded"
        release.status = "published"
        release.published_at = datetime.now(timezone.utc)
        record_admin_action(
            db, actor, "catalog.release_published",
            metadata={"release_id": release.id, "industry_id": industry_id, "version": release.version},
        )
        db.commit()
        db.refresh(release)
        return release
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


def current_release(db: Session, industry_id: int) -> CatalogRelease | None:
    require_reference_media_enabled()
    pointer = db.get(CatalogReleasePointer, industry_id)
    if pointer is None:
        return None
    release = db.get(CatalogRelease, pointer.release_id)
    if release is None or release.status != "published" or not release.manifest_path or not release.manifest_hash:
        raise HTTPException(status_code=503, detail="CATALOG_RELEASE_INVALID")
    try:
        content = reference_asset_storage.path_for(release.manifest_path).read_bytes()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail="CATALOG_RELEASE_BYTES_UNAVAILABLE") from error
    if hashlib.sha256(content).hexdigest() != release.manifest_hash:
        raise HTTPException(status_code=503, detail="CATALOG_MANIFEST_TAMPERED")
    return release


def read_current_manifest(
    db: Session, industry_id: int, family_slug: str | None = None
) -> dict | None:
    release = current_release(db, industry_id)
    if release is None:
        return None
    index_bytes = reference_asset_storage.path_for(release.manifest_path).read_bytes()
    index = json.loads(index_bytes)
    if family_slug is None:
        return index
    entry = next(
        (item for item in index.get("families", []) if item.get("slug") == family_slug),
        None,
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="CATALOG_FAMILY_NOT_FOUND")
    family_key = f"releases/{release.id}/{entry['manifest_path']}"
    try:
        content = reference_asset_storage.path_for(family_key).read_bytes()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail="CATALOG_RELEASE_BYTES_UNAVAILABLE") from error
    sealed = json.loads(content)
    content_hash = sealed.pop("content_hash", None)
    if (
        content_hash != entry.get("manifest_hash")
        or hashlib.sha256(_canonical_json(sealed)).hexdigest() != content_hash
    ):
        raise HTTPException(status_code=503, detail="CATALOG_MANIFEST_TAMPERED")
    return {**sealed, "content_hash": content_hash}
