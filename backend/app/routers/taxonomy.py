import json

from fastapi import APIRouter, HTTPException, Query

from ..config import settings
from ..deps import CurrentUser, DbSession, require_capability
from ..models import Industry, ReferenceSector, Store
from ..schemas import (
    BarcodeResolutionOut,
    RecategorizationConfirmRequest,
    RecategorizationPreviewOut,
    RecategorizationPreviewRequest,
    ReferenceCategoryOut,
    ReferenceSectorOut,
    TaxonomyAdoptRequest,
    TaxonomyStoreStateOut,
)
from ..services.store_authorization import StorePermission, require_store_permission
from ..services.taxonomy_service import (
    adopt_store_taxonomy,
    confirm_recategorization,
    legacy_preflight,
    list_reference_categories,
    list_reference_sectors,
    preview_recategorization,
    resolve_barcode,
)


router = APIRouter(prefix="/taxonomy", tags=["taxonomy"])


def _state(db: DbSession, user) -> TaxonomyStoreStateOut:
    store = db.get(Store, user.store_id)
    industry = db.get(Industry, store.industry_id) if store and store.industry_id else None
    return TaxonomyStoreStateOut(
        taxonomy_version=store.taxonomy_version,
        taxonomy_policy_version=store.taxonomy_policy_version,
        sector_code=industry.sector_code if industry else None,
        adopted_at=store.taxonomy_adopted_at,
        has_historical_inventory_usage=store.has_historical_inventory_usage,
        adoption_enabled=settings.TAXONOMY_ADOPTION_ENABLED,
    )


@router.get("/sectors", response_model=list[ReferenceSectorOut])
def sectors(current_user: CurrentUser, db: DbSession):
    require_store_permission(db, current_user, StorePermission.PRODUCTS_VIEW)
    return [ReferenceSectorOut(
        id=item.id,
        reference_key=item.reference_key,
        code=item.code,
        name_fa=item.name_fa,
        taxonomy_version=item.taxonomy_version,
        custom_categories_allowed=item.custom_categories_allowed,
    ) for item in list_reference_sectors(db)]


@router.get("/sectors/{sector_code}/categories", response_model=list[ReferenceCategoryOut])
def approved_categories(sector_code: str, current_user: CurrentUser, db: DbSession):
    require_store_permission(db, current_user, StorePermission.PRODUCTS_VIEW)
    return [ReferenceCategoryOut(
        id=item.id,
        reference_key=item.reference_key,
        code=item.code,
        name_fa=item.name_fa,
        examples=json.loads(item.examples_json),
        approval_status=item.approval_status,
    ) for item in list_reference_categories(db, sector_code)]


@router.get("/state", response_model=TaxonomyStoreStateOut)
def store_state(current_user: CurrentUser, db: DbSession):
    require_store_permission(db, current_user, StorePermission.PRODUCTS_VIEW)
    return _state(db, current_user)


@router.get("/preflight")
def preflight(current_user: CurrentUser, db: DbSession):
    require_store_permission(db, current_user, StorePermission.PRODUCTS_VIEW)
    return legacy_preflight(db, current_user)


@router.post("/adopt", response_model=TaxonomyStoreStateOut)
def adopt(payload: TaxonomyAdoptRequest, current_user: CurrentUser, db: DbSession):
    if not settings.TAXONOMY_ADOPTION_ENABLED:
        raise HTTPException(status_code=503, detail="TAXONOMY_ADOPTION_DISABLED")
    store = adopt_store_taxonomy(
        db,
        current_user,
        sector_code=payload.sector_code,
        expected_policy_version=payload.expected_policy_version,
    )
    db.commit()
    db.refresh(store)
    return _state(db, current_user)


@router.get("/barcodes/resolve", response_model=BarcodeResolutionOut)
def barcode_resolution(value: str = Query(min_length=1, max_length=64), *, current_user: CurrentUser, db: DbSession):
    require_capability(db, current_user, "barcode.lookup")
    require_store_permission(db, current_user, StorePermission.BARCODE_LOOKUP)
    return resolve_barcode(db, current_user, value)


@router.post("/recategorization/preview", response_model=RecategorizationPreviewOut)
def recategorization_preview(payload: RecategorizationPreviewRequest, current_user: CurrentUser, db: DbSession):
    require_capability(db, current_user, "inventory.write")
    require_store_permission(db, current_user, StorePermission.PRODUCTS_EDIT)
    require_store_permission(db, current_user, StorePermission.BARCODE_MANAGE)
    return preview_recategorization(
        db,
        current_user,
        product_ids=payload.product_ids,
        destination_category_id=payload.destination_category_id,
    )


@router.post("/recategorization/confirm")
def recategorization_confirm(payload: RecategorizationConfirmRequest, current_user: CurrentUser, db: DbSession):
    require_capability(db, current_user, "inventory.write")
    require_store_permission(db, current_user, StorePermission.PRODUCTS_EDIT)
    require_store_permission(db, current_user, StorePermission.BARCODE_MANAGE)
    result = confirm_recategorization(
        db,
        current_user,
        destination_category_id=payload.destination_category_id,
        targets=[item.model_dump() for item in payload.targets],
        expires_at=payload.expires_at,
        confirmation_token=payload.confirmation_token,
        operation_id=payload.operation_id,
    )
    db.commit()
    return result
