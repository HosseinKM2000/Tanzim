"""add catalog families, reference assets and publication registry

Revision ID: 20261118_0021
Revises: 20261118_0020
"""

import sqlalchemy as sa
from alembic import op

revision = "20261118_0021"
down_revision = "20261118_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalog_families",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("industry_id", sa.BigInteger(), sa.ForeignKey("industries.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("industry_id", "slug", name="uq_catalog_families_industry_slug"),
        sa.CheckConstraint("sort_order >= 0", name="ck_catalog_families_sort_order"),
    )
    op.create_index("ix_catalog_families_industry_id", "catalog_families", ["industry_id"])
    op.create_index("ix_catalog_families_is_active", "catalog_families", ["is_active"])
    op.create_table(
        "catalog_product_families",
        sa.Column("catalog_product_id", sa.BigInteger(), sa.ForeignKey("catalog_products.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("catalog_family_id", sa.BigInteger(), sa.ForeignKey("catalog_families.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "reference_media_assets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("mime_type", sa.String(80), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("variant_type", sa.String(20), nullable=False),
        sa.Column("validation_status", sa.String(20), nullable=False),
        sa.Column("source_reference", sa.String(500), nullable=False),
        sa.Column("created_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("source_sha256", "variant_type", name="uq_reference_assets_source_variant"),
        sa.UniqueConstraint("content_sha256", "variant_type", name="uq_reference_assets_content_variant"),
        sa.CheckConstraint("variant_type IN ('preview','detail')", name="ck_reference_assets_variant"),
        sa.CheckConstraint("validation_status IN ('approved','review','rejected')", name="ck_reference_assets_validation"),
        sa.CheckConstraint("byte_size > 0 AND width > 0 AND height > 0", name="ck_reference_assets_dimensions"),
    )
    op.create_index("ix_reference_media_assets_source_sha256", "reference_media_assets", ["source_sha256"])
    op.create_index("ix_reference_media_assets_content_sha256", "reference_media_assets", ["content_sha256"])
    op.create_index("ix_reference_media_assets_variant_type", "reference_media_assets", ["variant_type"])
    op.create_index("ix_reference_media_assets_validation_status", "reference_media_assets", ["validation_status"])
    op.create_table(
        "catalog_product_media",
        sa.Column("catalog_product_id", sa.BigInteger(), sa.ForeignKey("catalog_products.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("media_asset_id", sa.String(36), sa.ForeignKey("reference_media_assets.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("catalog_product_id", "role", name="uq_catalog_product_media_role"),
        sa.CheckConstraint("role IN ('preview','detail')", name="ck_catalog_product_media_role"),
        sa.CheckConstraint("sort_order >= 0", name="ck_catalog_product_media_sort_order"),
    )
    op.create_table(
        "catalog_releases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("industry_id", sa.BigInteger(), sa.ForeignKey("industries.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("manifest_path", sa.String(500), nullable=True),
        sa.Column("manifest_hash", sa.String(64), nullable=True),
        sa.Column("previous_release_id", sa.String(36), sa.ForeignKey("catalog_releases.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("industry_id", "version", name="uq_catalog_releases_industry_version"),
        sa.UniqueConstraint("request_id", name="uq_catalog_releases_request"),
        sa.CheckConstraint("status IN ('staging','published','superseded','failed')", name="ck_catalog_releases_status"),
        sa.CheckConstraint("version > 0", name="ck_catalog_releases_version"),
    )
    op.create_index("ix_catalog_releases_industry_id", "catalog_releases", ["industry_id"])
    op.create_index("ix_catalog_releases_status", "catalog_releases", ["status"])
    op.create_table(
        "catalog_release_pointers",
        sa.Column("industry_id", sa.BigInteger(), sa.ForeignKey("industries.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("release_id", sa.String(36), sa.ForeignKey("catalog_releases.id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("catalog_release_pointers")
    op.drop_index("ix_catalog_releases_status", table_name="catalog_releases")
    op.drop_index("ix_catalog_releases_industry_id", table_name="catalog_releases")
    op.drop_table("catalog_releases")
    op.drop_table("catalog_product_media")
    op.drop_index("ix_reference_media_assets_validation_status", table_name="reference_media_assets")
    op.drop_index("ix_reference_media_assets_variant_type", table_name="reference_media_assets")
    op.drop_index("ix_reference_media_assets_content_sha256", table_name="reference_media_assets")
    op.drop_index("ix_reference_media_assets_source_sha256", table_name="reference_media_assets")
    op.drop_table("reference_media_assets")
    op.drop_table("catalog_product_families")
    op.drop_index("ix_catalog_families_is_active", table_name="catalog_families")
    op.drop_index("ix_catalog_families_industry_id", table_name="catalog_families")
    op.drop_table("catalog_families")
