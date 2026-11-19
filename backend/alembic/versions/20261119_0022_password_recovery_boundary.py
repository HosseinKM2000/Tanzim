"""add enumeration-safe password recovery request boundary

Revision ID: 20261119_0022
Revises: 20261118_0021
"""

import sqlalchemy as sa
from alembic import op

revision = "20261119_0022"
down_revision = "20261118_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "password_recovery_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("identifier_hash", sa.String(64), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "outcome IN ('channel_unavailable','rate_limited')",
            name="ck_password_recovery_event_outcome",
        ),
    )
    op.create_index(
        "ix_password_recovery_identifier_time",
        "password_recovery_events",
        ["identifier_hash", "requested_at"],
    )
    op.create_index(
        "ix_password_recovery_source_time",
        "password_recovery_events",
        ["source_hash", "requested_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_password_recovery_source_time", table_name="password_recovery_events")
    op.drop_index("ix_password_recovery_identifier_time", table_name="password_recovery_events")
    op.drop_table("password_recovery_events")
