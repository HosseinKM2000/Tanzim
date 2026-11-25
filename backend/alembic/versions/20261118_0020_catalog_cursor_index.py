"""add stable catalog cursor traversal index

Revision ID: 20261118_0020
Revises: 20261116_0019
"""

from alembic import op

revision = "20261118_0020"
down_revision = "20261116_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_catalog_products_cursor_scope",
        "catalog_products",
        ["is_shared", "is_active", "industry_id", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_catalog_products_cursor_scope", table_name="catalog_products")
