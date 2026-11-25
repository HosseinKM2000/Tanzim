from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from ..config import settings
from ..deps import CurrentCatalogManager, CurrentCatalogUser, DbSession
from ..models import CatalogProduct, CatalogProductMedia, CatalogRelease, ReferenceMediaAsset
from ..reference_storage import reference_asset_storage
from ..schemas import (
    CatalogFamilyCreate,
    CatalogFamilyOut,
    CatalogPublishRequest,
    CatalogReleaseOut,
    ReferenceMediaIngestOut,
)
from ..services import catalog_reference_service as service
from ..services.authorization_service import is_admin
from ..services.store_service import active_store_context


router = APIRouter(prefix="/catalog-reference", tags=["catalog-reference"])
assets_router = APIRouter(prefix="/catalog-reference-assets", tags=["catalog-reference-assets"])


def _authorized_industry(db: DbSession, user, requested: int | None) -> int:
    if is_admin(user):
        if requested is None:
            raise HTTPException(status_code=422, detail="INDUSTRY_REQUIRED")
        return requested
    context = active_store_context(db, user)
    store_industry_id = context.store.industry_id
    if store_industry_id is None:
        raise HTTPException(status_code=409, detail="INDUSTRY_NOT_SELECTED")
    if requested is not None and requested != store_industry_id:
        raise HTTPException(status_code=404, detail="CATALOG_REFERENCE_NOT_FOUND")
    return store_industry_id


@router.post("/families", response_model=CatalogFamilyOut, status_code=status.HTTP_201_CREATED)
def create_family(payload: CatalogFamilyCreate, actor: CurrentCatalogManager, db: DbSession):
    return service.create_family(db, payload, actor)


@router.get("/families", response_model=list[CatalogFamilyOut])
def list_families(
    current_user: CurrentCatalogUser,
    db: DbSession,
    industry_id: int | None = Query(default=None, gt=0),
):
    return service.list_families(db, _authorized_industry(db, current_user, industry_id))


@router.post("/families/{family_id}/products/{product_id}", response_model=CatalogFamilyOut)
def link_product_family(
    family_id: int,
    product_id: int,
    actor: CurrentCatalogManager,
    db: DbSession,
):
    return service.link_product_family(db, family_id, product_id, actor)


@router.post("/media/ingest", response_model=ReferenceMediaIngestOut)
async def ingest_media(
    product_id: Annotated[int, Form(gt=0)],
    source_reference: Annotated[str, Form(min_length=3, max_length=500)],
    rights_confirmed: Annotated[bool, Form()],
    file: Annotated[UploadFile, File()],
    actor: CurrentCatalogManager,
    db: DbSession,
):
    content = await file.read(settings.REFERENCE_ASSET_MAX_INPUT_BYTES + 1)
    return service.ingest_reference_image(
        db,
        product_id=product_id,
        content=content,
        declared_mime=file.content_type or "application/octet-stream",
        source_reference=source_reference,
        rights_confirmed=rights_confirmed,
        actor=actor,
    )


@router.post("/releases/publish", response_model=CatalogReleaseOut)
def publish_catalog(payload: CatalogPublishRequest, actor: CurrentCatalogManager, db: DbSession):
    return service.publish_catalog(db, payload.request_id, payload.industry_id, actor)


@router.get("/releases/current", response_model=CatalogReleaseOut | None)
def get_current_release(
    current_user: CurrentCatalogUser,
    db: DbSession,
    industry_id: int | None = Query(default=None, gt=0),
):
    return service.current_release(db, _authorized_industry(db, current_user, industry_id))


@router.get("/releases/current/manifest")
def get_current_manifest(
    current_user: CurrentCatalogUser,
    db: DbSession,
    industry_id: int | None = Query(default=None, gt=0),
    family_slug: str | None = Query(default=None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
):
    return service.read_current_manifest(
        db, _authorized_industry(db, current_user, industry_id), family_slug
    )


@router.get("/releases/{release_id}/manifest")
def get_release_manifest(
    release_id: str,
    current_user: CurrentCatalogUser,
    db: DbSession,
    family_slug: str = Query(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
    industry_id: int | None = Query(default=None, gt=0),
):
    return service.read_release_family_manifest(
        db,
        _authorized_industry(db, current_user, industry_id),
        release_id,
        family_slug,
    )


@assets_router.get("/{asset_id}")
def read_reference_asset(
    asset_id: str,
    current_user: CurrentCatalogUser,
    db: DbSession,
    release_id: str | None = Query(default=None),
    family_slug: str | None = Query(
        default=None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    ),
):
    service.require_reference_media_enabled()
    asset = db.get(ReferenceMediaAsset, asset_id)
    if asset is None or asset.validation_status != "approved":
        raise HTTPException(status_code=404, detail="REFERENCE_ASSET_NOT_FOUND")
    authorized_industry = None if is_admin(current_user) else _authorized_industry(db, current_user, None)
    if family_slug is not None and release_id is None:
        raise HTTPException(status_code=422, detail="CATALOG_RELEASE_SCOPE_INCOMPLETE")
    if release_id is not None:
        if authorized_industry is None:
            release = db.get(CatalogRelease, release_id)
            if release is None:
                raise HTTPException(status_code=404, detail="REFERENCE_ASSET_NOT_FOUND")
            authorized_industry = release.industry_id
        if family_slug is not None:
            service.authorize_release_asset(
                db,
                industry_id=authorized_industry,
                release_id=release_id,
                family_slug=family_slug,
                asset_id=asset.id,
            )
        else:
            service.authorize_release_asset_any_family(
                db,
                industry_id=authorized_industry,
                release_id=release_id,
                asset_id=asset.id,
            )
    statement = (
        select(CatalogProduct.id)
        .join(CatalogProductMedia, CatalogProductMedia.catalog_product_id == CatalogProduct.id)
        .where(
            CatalogProductMedia.media_asset_id == asset.id,
            CatalogProduct.is_shared.is_(True),
            CatalogProduct.is_active.is_(True),
        )
    )
    if not is_admin(current_user):
        statement = statement.where(
            CatalogProduct.industry_id == authorized_industry
        )
    if db.scalar(statement.limit(1)) is None:
        raise HTTPException(status_code=404, detail="REFERENCE_ASSET_NOT_FOUND")
    try:
        path = reference_asset_storage.verified_blob(
            asset.storage_key, asset.content_sha256, asset.byte_size
        )
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail="REFERENCE_ASSET_BYTES_UNAVAILABLE") from error
    return FileResponse(
        path,
        media_type=asset.mime_type,
        headers={
            "ETag": f'"{asset.content_sha256}"',
            "X-Content-SHA256": asset.content_sha256,
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
