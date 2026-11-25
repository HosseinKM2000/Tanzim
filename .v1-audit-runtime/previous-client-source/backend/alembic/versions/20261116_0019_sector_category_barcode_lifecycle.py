"""add sector contract, category lifecycle and durable barcode reservations

Revision ID: 20261116_0019
Revises: 20261110_0018
"""

from __future__ import annotations

import json
from pathlib import Path

from alembic import op
import sqlalchemy as sa


revision = "20261116_0019"
down_revision = "20261110_0018"
branch_labels = None
depends_on = None


def _reference_data() -> dict:
    path = Path(__file__).resolve().parents[2] / "app" / "reference_data" / "tanzim_sector_categories_v1.json"
    return json.loads(path.read_text(encoding="utf-8"))


def upgrade() -> None:
    data = _reference_data()
    if data.get("taxonomy_version") != "scb-2026-11-14-v1":
        raise RuntimeError("SCB_REFERENCE_VERSION_INVALID")

    op.create_table(
        "reference_sectors",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("reference_key", sa.String(length=80), nullable=False),
        sa.Column("code", sa.String(length=2), nullable=False),
        sa.Column("name_fa", sa.String(length=160), nullable=False),
        sa.Column("taxonomy_version", sa.String(length=40), nullable=False),
        sa.Column("custom_categories_allowed", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("label_status", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("reference_key", name="uq_reference_sectors_reference_key"),
        sa.UniqueConstraint("code", name="uq_reference_sectors_code"),
    )
    op.create_index("ix_reference_sectors_taxonomy_version", "reference_sectors", ["taxonomy_version"])
    op.create_table(
        "reference_categories",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("sector_id", sa.BigInteger(), sa.ForeignKey("reference_sectors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reference_key", sa.String(length=80), nullable=False),
        sa.Column("code", sa.String(length=24), nullable=False),
        sa.Column("name_fa", sa.String(length=160), nullable=False),
        sa.Column("examples_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("approval_status", sa.String(length=20), nullable=False),
        sa.Column("taxonomy_version", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("approval_status IN ('approved','proposed')", name="ck_reference_categories_approval"),
        sa.UniqueConstraint("reference_key", name="uq_reference_categories_reference_key"),
        sa.UniqueConstraint("sector_id", "code", name="uq_reference_categories_sector_code"),
    )
    op.create_index("ix_reference_categories_sector_id", "reference_categories", ["sector_id"])
    op.create_index("ix_reference_categories_approval_status", "reference_categories", ["approval_status"])
    op.create_index("ix_reference_categories_taxonomy_version", "reference_categories", ["taxonomy_version"])

    sector_table = sa.table(
        "reference_sectors",
        sa.column("id", sa.BigInteger), sa.column("reference_key", sa.String), sa.column("code", sa.String),
        sa.column("name_fa", sa.String), sa.column("taxonomy_version", sa.String),
        sa.column("custom_categories_allowed", sa.Boolean), sa.column("label_status", sa.String),
    )
    category_table = sa.table(
        "reference_categories",
        sa.column("id", sa.BigInteger), sa.column("sector_id", sa.BigInteger),
        sa.column("reference_key", sa.String), sa.column("code", sa.String), sa.column("name_fa", sa.String),
        sa.column("examples_json", sa.Text), sa.column("approval_status", sa.String),
        sa.column("taxonomy_version", sa.String),
    )
    op.bulk_insert(sector_table, [{
        "id": int(sector["code"]), "reference_key": sector["reference_key"], "code": sector["code"],
        "name_fa": sector["name_fa"], "taxonomy_version": data["taxonomy_version"],
        "custom_categories_allowed": sector["custom_categories_allowed"],
        "label_status": sector["sector_label_status"],
    } for sector in data["sectors"]])
    op.bulk_insert(category_table, [{
        "id": int(sector["code"]) * 100 + int(category["code"]),
        "sector_id": int(sector["code"]), "reference_key": category["reference_key"],
        "code": category["code"], "name_fa": category["name_fa"],
        "examples_json": json.dumps(category["examples_fa"], ensure_ascii=False),
        "approval_status": category.get("approval_status", "proposed"),
        "taxonomy_version": data["taxonomy_version"],
    } for sector in data["sectors"] for category in sector["categories"]])

    op.add_column("industries", sa.Column("reference_sector_id", sa.BigInteger(), nullable=True))
    op.add_column("industries", sa.Column("sector_code", sa.String(length=2), nullable=True))
    op.add_column("industries", sa.Column("taxonomy_version", sa.String(length=40), nullable=True))
    op.create_foreign_key("fk_industries_reference_sector", "industries", "reference_sectors", ["reference_sector_id"], ["id"], ondelete="RESTRICT")
    op.create_unique_constraint("uq_industries_reference_sector_id", "industries", ["reference_sector_id"])
    op.create_unique_constraint("uq_industries_sector_code", "industries", ["sector_code"])

    bind = op.get_bind()
    for sector in data["sectors"]:
        collision = bind.execute(
            sa.text("SELECT id, reference_sector_id FROM industries WHERE name=:name"),
            {"name": sector["name_fa"]},
        ).first()
        if collision is not None:
            raise RuntimeError(
                "SCB_INDUSTRY_MAPPING_REVIEW_REQUIRED "
                f"sector={sector['code']} record_ids=[{collision.id}]"
            )
        bind.execute(sa.text(
            "INSERT INTO industries (name,description,is_active,reference_sector_id,sector_code,taxonomy_version) "
            "VALUES (:name,:description,true,:sector_id,:code,:version)"
        ), {
            "name": sector["name_fa"], "description": "حوزه مرجع تنظیم؛ نمونه‌ها موجودی واقعی نیستند.",
            "sector_id": int(sector["code"]), "code": sector["code"], "version": data["taxonomy_version"],
        })

    op.add_column("stores", sa.Column("taxonomy_version", sa.String(length=40), nullable=True))
    op.add_column("stores", sa.Column("taxonomy_adopted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("stores", sa.Column("taxonomy_adopted_by_user_id", sa.BigInteger(), nullable=True))
    op.add_column("stores", sa.Column("taxonomy_policy_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("stores", sa.Column("has_historical_inventory_usage", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_foreign_key("fk_stores_taxonomy_actor", "stores", "users", ["taxonomy_adopted_by_user_id"], ["id"], ondelete="RESTRICT")
    bind.execute(sa.text("""
        UPDATE stores SET has_historical_inventory_usage=true
        WHERE EXISTS (SELECT 1 FROM inventory_items i WHERE i.store_id=stores.id)
           OR EXISTS (SELECT 1 FROM invoices v WHERE v.store_id=stores.id)
           OR EXISTS (SELECT 1 FROM inventory_movements m WHERE m.store_id=stores.id)
           OR EXISTS (SELECT 1 FROM sync_operations o WHERE o.store_id=stores.id)
    """))

    op.add_column("categories", sa.Column("code", sa.String(length=24), nullable=True))
    op.add_column("categories", sa.Column("sector_code", sa.String(length=2), nullable=True))
    op.add_column("categories", sa.Column("origin", sa.String(length=20), nullable=False, server_default="legacy"))
    op.add_column("categories", sa.Column("approval_status", sa.String(length=20), nullable=False, server_default="legacy"))
    op.add_column("categories", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("categories", sa.Column("reference_key", sa.String(length=80), nullable=True))
    op.add_column("categories", sa.Column("reference_category_id", sa.BigInteger(), nullable=True))
    op.add_column("categories", sa.Column("taxonomy_version", sa.String(length=40), nullable=True))
    op.add_column("categories", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.create_index("ix_categories_sector_code", "categories", ["sector_code"])
    op.create_index("ix_categories_origin", "categories", ["origin"])
    op.create_index("ix_categories_is_active", "categories", ["is_active"])
    op.create_index("ix_categories_reference_category_id", "categories", ["reference_category_id"])
    op.create_foreign_key("fk_categories_reference_category", "categories", "reference_categories", ["reference_category_id"], ["id"], ondelete="RESTRICT")
    op.create_unique_constraint("uq_categories_store_reference_key", "categories", ["store_id", "reference_key"])
    op.create_unique_constraint("uq_categories_store_code", "categories", ["store_id", "code"])

    op.create_table(
        "barcode_reservations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("store_id", sa.BigInteger(), sa.ForeignKey("stores.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=False, server_default="product"),
        sa.Column("target_id", sa.BigInteger(), nullable=False),
        sa.Column("origin", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("category_reference_key", sa.String(length=80), nullable=True),
        sa.Column("replaced_by_reservation_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("origin IN ('external','internal','legacy_unknown')", name="ck_barcode_reservations_origin"),
        sa.CheckConstraint("status IN ('active','retired','deleted')", name="ck_barcode_reservations_status"),
        sa.CheckConstraint("target_type IN ('product')", name="ck_barcode_reservations_target_type"),
        sa.ForeignKeyConstraint(["replaced_by_reservation_id"], ["barcode_reservations.id"], name="fk_barcode_reservations_replacement", ondelete="RESTRICT"),
        sa.UniqueConstraint("store_id", "value", name="uq_barcode_reservations_store_value"),
    )
    op.create_index("ix_barcode_reservations_store_id", "barcode_reservations", ["store_id"])
    op.create_index("ix_barcode_reservations_target_id", "barcode_reservations", ["target_id"])
    op.create_index("ix_barcode_reservations_store_status_value", "barcode_reservations", ["store_id", "status", "value"])
    op.add_column("product_barcodes", sa.Column("lifecycle_status", sa.String(length=20), nullable=False, server_default="active"))
    op.add_column("product_barcodes", sa.Column("reservation_id", sa.BigInteger(), nullable=True))
    op.add_column("product_barcodes", sa.Column("category_reference_key", sa.String(length=80), nullable=True))
    op.create_index("ix_product_barcodes_lifecycle_status", "product_barcodes", ["lifecycle_status"])
    bind.execute(sa.text("""
        INSERT INTO barcode_reservations
            (store_id,value,target_type,target_id,origin,status,created_at)
        SELECT store_id,value,'product',inventory_item_id,
               CASE WHEN source='manufacturer' THEN 'external' ELSE 'legacy_unknown' END,
               CASE WHEN is_active THEN 'active' ELSE 'retired' END,created_at
        FROM product_barcodes
    """))
    bind.execute(sa.text("""
        UPDATE product_barcodes b SET reservation_id=r.id,
            lifecycle_status=CASE WHEN b.is_active THEN 'active' ELSE 'retired' END
        FROM barcode_reservations r
        WHERE r.store_id=b.store_id AND r.value=b.value
    """))
    op.alter_column("product_barcodes", "reservation_id", nullable=False)
    op.create_unique_constraint("uq_product_barcodes_reservation_id", "product_barcodes", ["reservation_id"])
    op.create_foreign_key("fk_product_barcodes_reservation", "product_barcodes", "barcode_reservations", ["reservation_id"], ["id"], ondelete="RESTRICT")


def downgrade() -> None:
    op.drop_constraint("fk_product_barcodes_reservation", "product_barcodes", type_="foreignkey")
    op.drop_constraint("uq_product_barcodes_reservation_id", "product_barcodes", type_="unique")
    op.drop_index("ix_product_barcodes_lifecycle_status", table_name="product_barcodes")
    op.drop_column("product_barcodes", "category_reference_key")
    op.drop_column("product_barcodes", "reservation_id")
    op.drop_column("product_barcodes", "lifecycle_status")
    op.drop_table("barcode_reservations")
    op.drop_constraint("uq_categories_store_code", "categories", type_="unique")
    op.drop_constraint("uq_categories_store_reference_key", "categories", type_="unique")
    op.drop_constraint("fk_categories_reference_category", "categories", type_="foreignkey")
    for index in ("ix_categories_reference_category_id", "ix_categories_is_active", "ix_categories_origin", "ix_categories_sector_code"):
        op.drop_index(index, table_name="categories")
    for column in ("version", "taxonomy_version", "reference_category_id", "reference_key", "is_active", "approval_status", "origin", "sector_code", "code"):
        op.drop_column("categories", column)
    op.drop_constraint("fk_stores_taxonomy_actor", "stores", type_="foreignkey")
    for column in ("has_historical_inventory_usage", "taxonomy_policy_version", "taxonomy_adopted_by_user_id", "taxonomy_adopted_at", "taxonomy_version"):
        op.drop_column("stores", column)
    op.drop_constraint("uq_industries_sector_code", "industries", type_="unique")
    op.drop_constraint("uq_industries_reference_sector_id", "industries", type_="unique")
    op.drop_constraint("fk_industries_reference_sector", "industries", type_="foreignkey")
    for column in ("taxonomy_version", "sector_code", "reference_sector_id"):
        op.drop_column("industries", column)
    op.drop_table("reference_categories")
    op.drop_table("reference_sectors")
