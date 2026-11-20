"""record canonical taxonomy seed identity

Revision ID: 20261120_0023
Revises: 20261119_0022
"""

import hashlib
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "20261120_0023"
down_revision = "20261119_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "canonical_taxonomy_seeds",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("taxonomy_version", sa.String(40), nullable=False, unique=True),
        sa.Column("content_sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("sector_count", sa.Integer(), nullable=False),
        sa.Column("approved_category_count", sa.Integer(), nullable=False),
        sa.Column("proposed_category_count", sa.Integer(), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    source = Path(__file__).resolve().parents[2] / "app" / "reference_data" / "tanzim_sector_categories_v1.json"
    raw = source.read_bytes()
    data = json.loads(raw.decode("utf-8"))
    sectors = data.get("sectors", [])
    categories = [category for sector in sectors for category in sector.get("categories", [])]
    approved = sum(category.get("approval_status") == "approved" for category in categories)
    proposed = len(categories) - approved
    if (
        data.get("taxonomy_version") != "scb-2026-11-14-v1"
        or data.get("sector_count") != len(sectors)
        or len(sectors) != 24
        or data.get("parent_category_count") != len(categories)
        or data.get("approved_parent_category_count") != approved
        or approved != 25
        or data.get("proposed_parent_category_count") != proposed
    ):
        raise RuntimeError("CANONICAL_TAXONOMY_SOURCE_INVALID")
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    op.execute(sa.text(
        "INSERT INTO canonical_taxonomy_seeds "
        "(taxonomy_version,content_sha256,sector_count,approved_category_count,proposed_category_count) "
        "VALUES (:version,:digest,:sectors,:approved,:proposed)"
    ).bindparams(
        version=data["taxonomy_version"], digest=hashlib.sha256(canonical).hexdigest(),
        sectors=len(sectors), approved=approved, proposed=proposed,
    ))


def downgrade() -> None:
    op.drop_table("canonical_taxonomy_seeds")
