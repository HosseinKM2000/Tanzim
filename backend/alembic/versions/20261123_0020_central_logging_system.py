"""Add central logging tables (log_apps, central_logs, log_rules)

Revision ID: 20261123_0020
Revises: 20261115_0019
Create Date: 2026-11-23 18:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261123_0020"
down_revision = "20261115_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. log_apps
    op.create_table(
        "log_apps",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("api_key", sa.String(length=128), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. central_logs
    op.create_table(
        "central_logs",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True, autoincrement=True),
        sa.Column("app_id", sa.String(length=64), sa.ForeignKey("log_apps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("store_id", sa.BigInteger(), nullable=True),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("context_json", sa.Text(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("device", sa.String(length=128), nullable=True),
        sa.Column("location", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_central_logs_app_time", "central_logs", ["app_id", "created_at"])
    op.create_index("ix_central_logs_level_time", "central_logs", ["level", "created_at"])
    op.create_index("ix_central_logs_category", "central_logs", ["category"])
    op.create_index("ix_central_logs_store", "central_logs", ["store_id"])

    # 3. log_rules
    op.create_table(
        "log_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("app_id", sa.String(length=64), sa.ForeignKey("log_apps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("min_level", sa.String(length=16), server_default="info", nullable=False),
        sa.Column("save_to_db", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("send_telegram", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("telegram_thread_id", sa.Integer(), nullable=True),
        sa.Column("mute_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("app_id", "category", name="uq_log_rules_app_category"),
    )

    # Seed default applications
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO log_apps (id, name, api_key, is_active) VALUES "
            "('tanzim-app', 'Tanzim Web/PWA App', 'tzm_app_live_8f93e2b10a4c9d', true), "
            "('tanzim-backend', 'Tanzim FastAPI Backend', 'tzm_back_live_4a17c8e9d2f0b3', true), "
            "('tanzim-landing', 'Tanzim Landing & Blog', 'tzm_land_live_7c34b1a8f902e5', true), "
            "('shagerd-core', 'Shagerd Ecosystem Core', 'shg_core_live_9d82a1b7e6f403', true) "
            "ON CONFLICT (id) DO NOTHING"
        )
    )


def downgrade() -> None:
    op.drop_table("log_rules")
    op.drop_table("central_logs")
    op.drop_table("log_apps")
