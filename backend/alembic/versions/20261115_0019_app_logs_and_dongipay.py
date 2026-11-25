"""Add app_logs, subscription_payments, and update commercial plans

Revision ID: 20261115_0019
Revises: 20261110_0018
Create Date: 2026-11-15 15:25:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261115_0019"
down_revision = "20261110_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_logs",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("event", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("store_id", sa.BigInteger(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("path", sa.String(length=255), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("details_json", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
    )
    op.create_index("ix_app_logs_created_at", "app_logs", ["created_at"])
    op.create_index("ix_app_logs_level", "app_logs", ["level"])
    op.create_index("ix_app_logs_source", "app_logs", ["source"])
    op.create_index("ix_app_logs_event", "app_logs", ["event"])
    op.create_index("ix_app_logs_user_id", "app_logs", ["user_id"])
    op.create_index("ix_app_logs_store_id", "app_logs", ["store_id"])
    op.create_index("ix_app_logs_request_id", "app_logs", ["request_id"])

    op.create_table(
        "subscription_payments",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True, autoincrement=True),
        sa.Column("order_ref", sa.String(length=64), nullable=False, unique=True),
        sa.Column("dp_id", sa.String(length=64), nullable=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("store_id", sa.BigInteger(), sa.ForeignKey("stores.id"), nullable=True),
        sa.Column("plan_id", sa.String(length=40), nullable=False),
        sa.Column("amount_toman", sa.BigInteger(), nullable=False),
        sa.Column("is_first_month_discount", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("gateway", sa.String(length=32), nullable=False, server_default="dongipay"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="created"),
        sa.Column("pay_url", sa.Text(), nullable=True),
        sa.Column("ref_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_subscription_payments_order_ref", "subscription_payments", ["order_ref"], unique=True)
    op.create_index("ix_subscription_payments_dp_id", "subscription_payments", ["dp_id"])
    op.create_index("ix_subscription_payments_user_id", "subscription_payments", ["user_id"])
    op.create_index("ix_subscription_payments_store_id", "subscription_payments", ["store_id"])
    op.create_index("ix_subscription_payments_plan_id", "subscription_payments", ["plan_id"])
    op.create_index("ix_subscription_payments_status", "subscription_payments", ["status"])
    op.create_index("ix_subscription_payments_created_at", "subscription_payments", ["created_at"])

    # Update existing plan rows to the new commercial pricing & names
    plans_table = sa.table(
        "subscription_plans",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("price_minor", sa.BigInteger),
        sa.column("duration", sa.Integer),
        sa.column("duration_unit", sa.String),
        sa.column("is_offer_available", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )
    op.execute(
        plans_table.update()
        .where(plans_table.c.id == "personal")
        .values(name="پلاس", price_minor=9_950_000, duration=30, duration_unit="day", is_offer_available=True, is_active=True)
    )
    op.execute(
        plans_table.update()
        .where(plans_table.c.id == "pro")
        .values(name="پرو", price_minor=24_900_000, duration=30, duration_unit="day", is_offer_available=True, is_active=True)
    )
    op.execute(
        plans_table.update()
        .where(plans_table.c.id == "vip")
        .values(name="بیزینس", price_minor=49_500_000, duration=30, duration_unit="day", is_offer_available=True, is_active=True)
    )


def downgrade() -> None:
    op.drop_table("subscription_payments")
    op.drop_table("app_logs")
