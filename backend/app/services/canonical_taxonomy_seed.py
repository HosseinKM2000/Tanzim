from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    CanonicalTaxonomySeed,
    CatalogProduct,
    Category,
    Industry,
    ReferenceCategory,
    ReferenceSector,
    Store,
    User,
)
from .taxonomy_service import (
    PROPOSED_QA_TAXONOMY_VERSION,
    TAXONOMY_VERSION,
    active_taxonomy_version,
    proposed_taxonomy_enabled,
)


SOURCE = Path(__file__).parents[1] / "reference_data" / "tanzim_sector_categories_v1.json"
SOURCE_PROPOSED_QA = (
    Path(__file__).parents[1] / "reference_data" / "tanzim_sector_categories_v2_proposed_qa.json"
)


@dataclass(frozen=True)
class CanonicalSeedResult:
    taxonomy_version: str
    content_sha256: str
    sector_count: int
    approved_category_count: int
    proposed_category_count: int


def _source() -> tuple[dict, CanonicalSeedResult]:
    version = active_taxonomy_version()
    if version == TAXONOMY_VERSION:
        source = SOURCE
    elif version == PROPOSED_QA_TAXONOMY_VERSION:
        source = SOURCE_PROPOSED_QA
    else:
        raise RuntimeError("CANONICAL_TAXONOMY_VERSION_UNSUPPORTED")
    raw = source.read_bytes()
    data = json.loads(raw.decode("utf-8"))
    sectors = data.get("sectors", [])
    categories = [category for sector in sectors for category in sector.get("categories", [])]
    approved = sum(category.get("approval_status") == "approved" for category in categories)
    proposed = len(categories) - approved
    expected = (
        data.get("taxonomy_version") == version
        and data.get("sector_count") == len(sectors) == 24
        and data.get("parent_category_count") == len(categories)
        and data.get("approved_parent_category_count") == approved == 25
        and data.get("proposed_parent_category_count") == proposed
    )
    if not expected:
        raise RuntimeError("CANONICAL_TAXONOMY_SOURCE_INVALID")
    automotive = next((sector for sector in sectors if sector.get("code") == "01"), None)
    if automotive is None or automotive.get("custom_categories_allowed") or len(automotive["categories"]) != 25:
        raise RuntimeError("AUTOMOTIVE_TAXONOMY_CONTRACT_INVALID")
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return data, CanonicalSeedResult(
        taxonomy_version=version,
        content_sha256=hashlib.sha256(canonical).hexdigest(),
        sector_count=len(sectors),
        approved_category_count=approved,
        proposed_category_count=proposed,
    )


def seed_canonical_taxonomy(db: Session) -> CanonicalSeedResult:
    data, result = _source()
    recorded = db.scalar(select(CanonicalTaxonomySeed).where(
        CanonicalTaxonomySeed.taxonomy_version == result.taxonomy_version,
    ))
    if recorded is not None and (
        recorded.content_sha256 != result.content_sha256
        or recorded.sector_count != result.sector_count
        or recorded.approved_category_count != result.approved_category_count
        or recorded.proposed_category_count != result.proposed_category_count
    ):
        raise RuntimeError("CANONICAL_TAXONOMY_VERSION_CONTENT_MISMATCH")

    for sector_data in data["sectors"]:
        sector_id = int(sector_data["code"])
        sector = db.get(ReferenceSector, sector_id)
        values = (
            sector_data["reference_key"], sector_data["code"], sector_data["name_fa"],
            sector_data["custom_categories_allowed"], sector_data["sector_label_status"],
        )
        if sector is None:
            sector = ReferenceSector(
                id=sector_id, reference_key=values[0], code=values[1], name_fa=values[2],
                taxonomy_version=result.taxonomy_version, custom_categories_allowed=values[3], label_status=values[4],
            )
            db.add(sector)
            db.flush()
        elif (
            sector.reference_key, sector.code, sector.name_fa, sector.custom_categories_allowed, sector.label_status,
        ) != values or sector.taxonomy_version != result.taxonomy_version:
            raise RuntimeError(f"CANONICAL_SECTOR_CONFLICT:{sector_data['code']}")

        industry = db.scalar(select(Industry).where(Industry.reference_sector_id == sector.id))
        if industry is None:
            name_collision = db.scalar(select(Industry).where(Industry.name == sector.name_fa))
            if name_collision is not None:
                raise RuntimeError(f"CANONICAL_INDUSTRY_REVIEW_REQUIRED:{sector.code}")
            db.add(Industry(
                name=sector.name_fa,
                description="حوزه مرجع تنظیم؛ نمونه‌ها موجودی واقعی نیستند.",
                is_active=True,
                reference_sector_id=sector.id,
                sector_code=sector.code,
                taxonomy_version=result.taxonomy_version,
            ))
        elif industry.sector_code != sector.code or industry.taxonomy_version != result.taxonomy_version:
            raise RuntimeError(f"CANONICAL_INDUSTRY_CONFLICT:{sector.code}")

        for category_data in sector_data["categories"]:
            category_id = sector_id * 100 + int(category_data["code"])
            category = db.get(ReferenceCategory, category_id)
            category_values = (
                sector.id, category_data["reference_key"], category_data["code"], category_data["name_fa"],
                json.dumps(category_data["examples_fa"], ensure_ascii=False),
                category_data.get("approval_status", "proposed"), result.taxonomy_version,
            )
            if category is None:
                db.add(ReferenceCategory(
                    id=category_id, sector_id=category_values[0], reference_key=category_values[1],
                    code=category_values[2], name_fa=category_values[3], examples_json=category_values[4],
                    approval_status=category_values[5], taxonomy_version=category_values[6],
                ))
            elif (
                category.sector_id, category.reference_key, category.code, category.name_fa,
                category.examples_json, category.approval_status, category.taxonomy_version,
            ) != category_values:
                raise RuntimeError(f"CANONICAL_CATEGORY_CONFLICT:{category_data['reference_key']}")

    if recorded is None:
        db.add(CanonicalTaxonomySeed(
            taxonomy_version=result.taxonomy_version,
            content_sha256=result.content_sha256,
            sector_count=result.sector_count,
            approved_category_count=result.approved_category_count,
            proposed_category_count=result.proposed_category_count,
        ))
    db.flush()
    return result


def reset_reference_taxonomy_for_qa(db: Session) -> dict[str, int]:
    """Disposable QA only: clear migration-seeded v1 reference rows.

    A single database cannot hold both the production reference bank and the
    proposed QA extension because `reference_sectors.code` and
    `reference_categories.id` are globally unique per sector. This helper is
    fail-closed: it only runs under the QA proposed gate and only while no
    store has adopted or referenced a taxonomy yet.
    """
    if not proposed_taxonomy_enabled():
        raise RuntimeError("QA_PROPOSED_TAXONOMY_REQUIRED_FOR_REFERENCE_RESET")
    if db.scalar(select(func.count()).select_from(Store).where(Store.taxonomy_version.is_not(None))):
        raise RuntimeError("REFERENCE_RESET_STORE_ADOPTION_REFUSED")
    if db.scalar(select(func.count()).select_from(Category).where(Category.origin == "system")):
        raise RuntimeError("REFERENCE_RESET_STORE_CATEGORY_REFUSED")

    sector_ids = select(ReferenceSector.id)
    industry_ids = list(db.scalars(select(Industry.id).where(Industry.reference_sector_id.in_(sector_ids))))
    if industry_ids:
        in_use = db.scalar(select(func.count()).select_from(Store).where(Store.industry_id.in_(industry_ids))) or 0
        in_use += db.scalar(select(func.count()).select_from(User).where(User.industry_id.in_(industry_ids))) or 0
        in_use += db.scalar(select(func.count()).select_from(CatalogProduct).where(
            CatalogProduct.industry_id.in_(industry_ids),
        )) or 0
        if in_use:
            raise RuntimeError("REFERENCE_RESET_INDUSTRY_IN_USE_REFUSED")

    categories = int(db.scalar(select(func.count()).select_from(ReferenceCategory)) or 0)
    sectors = int(db.scalar(select(func.count()).select_from(ReferenceSector)) or 0)
    seeds = int(db.scalar(select(func.count()).select_from(CanonicalTaxonomySeed)) or 0)

    db.execute(ReferenceCategory.__table__.delete())
    if industry_ids:
        db.execute(Industry.__table__.delete().where(Industry.id.in_(industry_ids)))
    db.execute(CanonicalTaxonomySeed.__table__.delete())
    db.execute(ReferenceSector.__table__.delete())
    db.flush()
    return {"categories": categories, "sectors": sectors, "seeds": seeds, "industries": len(industry_ids)}
