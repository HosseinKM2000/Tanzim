from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func

from ..deps import CurrentCategoryWriter, CurrentCategoryUser, DbSession
from ..models import Category, Industry, InventoryItem, ReferenceSector, Store
from ..schemas import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    CategoryWithStats,
)
from ..services.taxonomy_service import active_taxonomy_version, custom_category_code

router = APIRouter(prefix="/categories", tags=["categories"])


def _get_owned_category(
    db: DbSession,
    category_id: int,
    store_id: int,
) -> Category:
    category = db.get(Category, category_id)

    if category is None or category.store_id != store_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="دسته بندی یافت نشد",
        )

    return category


def _category_exists(
    db: DbSession,
    name: str,
    store_id: int,
    exclude_id: int | None = None,
) -> bool:
    stmt = select(Category).where(
        Category.name == name,
        Category.store_id == store_id,
    )

    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)

    return db.scalar(stmt) is not None


@router.get("", response_model=list[CategoryOut])
def list_categories(
    current_user: CurrentCategoryUser,
    db: DbSession,
) -> list[Category]:
    stmt = (
        select(Category)
        .where(Category.store_id == current_user.store_id)
        .order_by(Category.created_at.desc(), Category.id.desc())
    )

    return list(db.scalars(stmt))


@router.post(
    "",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: CategoryCreate,
    current_user: CurrentCategoryWriter,
    db: DbSession,
) -> Category:
    if payload.id is not None:
        existing = db.get(Category, payload.id)
        if existing is not None:
            if existing.store_id == current_user.store_id:
                return existing
            raise HTTPException(status_code=409, detail="CATEGORY_ID_CONFLICT")

    if _category_exists(db, payload.name, current_user.store_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این دسته بندی قبلا ثبت شده است",
        )

    store = db.get(Store, current_user.store_id)
    industry = db.get(Industry, store.industry_id) if store and store.industry_id else None
    sector = db.get(ReferenceSector, industry.reference_sector_id) if industry and industry.reference_sector_id else None
    adopted = store is not None and store.taxonomy_version == active_taxonomy_version()
    if adopted and (sector is None or not sector.custom_categories_allowed):
        raise HTTPException(status_code=403, detail="CUSTOM_CATEGORY_FORBIDDEN_FOR_SECTOR")

    category = Category(
        store_id=current_user.store_id,
        id=payload.id,
        name=payload.name,
        description=payload.description,
        user_id=current_user.data_owner_id,
        code=custom_category_code() if adopted else None,
        sector_code=sector.code if adopted and sector else None,
        origin="custom" if adopted else "legacy",
        approval_status="approved" if adopted else "legacy",
        is_active=True,
        taxonomy_version=active_taxonomy_version() if adopted else None,
    )

    db.add(category)
    db.commit()
    db.refresh(category)

    return category


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    current_user: CurrentCategoryWriter,
    db: DbSession,
) -> Category:
    category = _get_owned_category(
        db,
        category_id,
        current_user.store_id,
    )
    if category.origin == "system":
        raise HTTPException(status_code=409, detail="SYSTEM_CATEGORY_IMMUTABLE")

    if payload.name and _category_exists(
        db,
        payload.name,
        current_user.store_id,
        exclude_id=category.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این دسته بندی قبلا ثبت شده است",
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "is_active" and category.origin != "custom":
            raise HTTPException(status_code=409, detail="CATEGORY_LIFECYCLE_INVALID")
        setattr(category, field, value)
    category.version += 1

    db.commit()
    db.refresh(category)

    return category


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_category(
    category_id: int,
    current_user: CurrentCategoryWriter,
    db: DbSession,
) -> None:
    category = db.get(Category, category_id)
    if category is None:
        # DELETE is idempotent for a resource that no longer exists.
        return
    if category.store_id != current_user.store_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="دسته بندی یافت نشد",
        )

    if category.origin == "system":
        raise HTTPException(status_code=409, detail="SYSTEM_CATEGORY_IMMUTABLE")
    category.is_active = False
    category.version += 1
    db.commit()


@router.get("/stats", response_model=list[CategoryWithStats])
def category_stats(
    current_user: CurrentCategoryUser,
    db: DbSession,
) -> list[CategoryWithStats]:
    rows = db.execute(
        select(
            Category,
            func.count(InventoryItem.id).label("product_count"),
            func.coalesce(
                func.sum(InventoryItem.quantity),
                0,
            ).label("total_quantity"),
        )
        .outerjoin(InventoryItem, InventoryItem.category_id == Category.id)
        .where(Category.store_id == current_user.store_id)
        .group_by(Category.id)
        .order_by(Category.created_at.desc(), Category.id.desc())
    ).all()

    result = []

    for category, product_count, total_quantity in rows:
        result.append(
            CategoryWithStats(
                id=category.id,
                name=category.name,
                description=category.description,
                code=category.code,
                sector_code=category.sector_code,
                origin=category.origin,
                approval_status=category.approval_status,
                is_active=category.is_active,
                reference_key=category.reference_key,
                taxonomy_version=category.taxonomy_version,
                version=category.version,
                created_at=category.created_at,
                updated_at=category.updated_at,
                product_count=product_count,
                total_quantity=total_quantity,
            )
        )

    return result
