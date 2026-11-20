import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import Base
from app.models import (
    CanonicalTaxonomySeed, Category, InventoryItem, InventoryMovement, Invoice, InvoiceLine,
    MediaAsset, ProductBarcode, ReferenceCategory, Store, StoreActivity, User,
)
from app.qa.auditor import audit
from app.qa import seeder
from app.qa.safety import QaSafetyError, validate_target
from app.qa.seeder import current_counts, seed_profile


def target(tmp_path: Path, **overrides):
    values = {
        "environment": "qa",
        "database_url": "postgresql+psycopg://qa:qa@127.0.0.1/tanzim_qa_gate7",
        "media_root": str(tmp_path / "qa-private-media"),
        "reference_media_root": str(tmp_path / "qa-reference-media"),
        "allowlist": {"tanzim_qa_gate7"},
        "confirmation": "qa:tanzim_qa_gate7",
    }
    values.update(overrides)
    return validate_target(**values)


def test_qa_guard_accepts_only_explicit_isolated_target(tmp_path):
    assert target(tmp_path).database_name == "tanzim_qa_gate7"
    for change in (
        {"environment": "production"},
        {"database_url": "postgresql+psycopg://qa:qa@db.example.com/tanzim_qa_gate7"},
        {"database_url": "postgresql+psycopg://qa:qa@127.0.0.1/tanzim"},
        {"allowlist": set()},
        {"confirmation": "qa:wrong"},
        {"media_root": str(tmp_path / "media")},
    ):
        with pytest.raises(QaSafetyError):
            target(tmp_path, **change)


def test_smoke_seed_is_idempotent_and_auditable(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'qa-seed.db').as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        preview = seed_profile(db, "smoke", password="unused", dry_run=True)
        assert preview.to_dict() == {
            "profile": "smoke", "stores": 1, "users": 1, "products": 8,
            "counterparties": 2, "invoices": 2, "barcodes": 8, "dry_run": True,
        }
        first = seed_profile(db, "smoke", password="Gate7-test-password-123!")
        first_counts = current_counts(db)
        second = seed_profile(db, "smoke", password="Gate7-test-password-123!")
        assert first.to_dict() == second.to_dict()
        assert current_counts(db) == first_counts == {
            "users": 1, "stores": 1, "products": 8,
            "counterparties": 2, "invoices": 2, "barcodes": 8,
        }
        report = audit(db)
        assert report["status"] == "PASS", json.dumps(report, ensure_ascii=False)
    engine.dispose()


def test_comprehensive_profile_keeps_stores_isolated(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'qa-comprehensive.db').as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed_profile(db, "comprehensive", password="Gate7-test-password-123!")
        assert current_counts(db) == {
            "users": 6, "stores": 5, "products": 84,
            "counterparties": 8, "invoices": 8, "barcodes": 84,
        }
        empty_owner = db.scalar(select(User).where(User.username == "qa-gate7-empty-owner"))
        empty_store = db.scalar(select(Store).where(Store.owner_user_id == empty_owner.id))
        assert db.scalar(select(func.count()).select_from(InventoryItem).where(InventoryItem.store_id == empty_store.id)) == 0
        assert db.scalar(select(func.count()).select_from(InventoryMovement)) == 24
        assert db.scalar(select(func.min(Invoice.posted_at))) is not None
        assert audit(db)["status"] == "PASS"
        auto_owner = db.scalar(select(User).where(User.username == "qa-gate7-auto-owner"))
        auto_store = db.scalar(select(Store).where(Store.owner_user_id == auto_owner.id))
        assert auto_store.taxonomy_version == "scb-2026-11-14-v1"
        automotive_categories = list(db.scalars(select(Category).where(
            Category.store_id == auto_store.id,
        ).order_by(Category.code)))
        assert len(automotive_categories) == 25
        assert {category.origin for category in automotive_categories} == {"system"}
        assert {category.code for category in automotive_categories} == {f"{number:02d}" for number in range(1, 26)}
        assert db.scalar(select(func.count()).select_from(ProductBarcode).where(
            ProductBarcode.store_id == auto_store.id,
            ProductBarcode.source == "tanzim",
        )) == 18
        seed_record = db.scalar(select(CanonicalTaxonomySeed))
        assert seed_record is not None
        assert (seed_record.sector_count, seed_record.approved_category_count, seed_record.proposed_category_count) == (24, 25, 256)
        legacy_category = db.scalar(select(Category).where(
            Category.store_id != empty_store.id,
            Category.origin == "custom",
        ).order_by(Category.id))
        legacy_category.name = "legacy fixture label"
        legacy_line = db.scalar(select(InvoiceLine).order_by(InvoiceLine.id))
        legacy_line.before_quantity = max(0, legacy_line.after_quantity - 2)
        db.commit()
        seed_profile(db, "comprehensive", password="Gate7-test-password-123!")
        db.refresh(legacy_category)
        assert legacy_category.name != "legacy fixture label"
        db.refresh(legacy_line)
        movement = db.scalar(select(InventoryMovement).where(InventoryMovement.invoice_line_id == legacy_line.id))
        assert (legacy_line.before_quantity, legacy_line.after_quantity) == (
            movement.before_quantity,
            movement.after_quantity,
        )
    engine.dispose()


def test_canonical_seed_is_idempotent_and_keeps_proposals_inactive(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'canonical-seed.db').as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        first = seeder.seed_canonical_taxonomy(db)
        db.commit()
        second = seeder.seed_canonical_taxonomy(db)
        db.commit()
        assert first == second
        assert db.scalar(select(func.count()).select_from(ReferenceCategory)) == 281
        assert db.scalar(select(func.count()).select_from(ReferenceCategory).where(
            ReferenceCategory.approval_status == "approved",
        )) == 25
        assert db.scalar(select(func.count()).select_from(CanonicalTaxonomySeed)) == 1
    engine.dispose()


def test_automotive_profile_is_comprehensive_idempotent_and_auditable(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'automotive-seed.db').as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        preview = seed_profile(db, "automotive", password="unused", dry_run=True)
        assert preview.to_dict() == {
            "profile": "automotive", "stores": 1, "users": 1, "products": 125,
            "counterparties": 10, "invoices": 20, "barcodes": 125, "dry_run": True,
        }
        first = seed_profile(db, "automotive", password="Automotive-QA-password-123!")
        first_counts = current_counts(db)
        second = seed_profile(db, "automotive", password="Automotive-QA-password-123!")
        assert first.to_dict() == second.to_dict()
        assert current_counts(db) == first_counts == {
            "users": 1, "stores": 1, "products": 125,
            "counterparties": 10, "invoices": 20, "barcodes": 125,
        }
        store = db.scalar(select(Store))
        assert db.scalar(select(func.count()).select_from(Category).where(Category.store_id == store.id)) == 25
        assert db.scalar(select(func.count()).select_from(ProductBarcode).where(
            ProductBarcode.store_id == store.id, ProductBarcode.source == "tanzim",
        )) == 94
        assert db.scalar(select(func.count()).select_from(ProductBarcode).where(
            ProductBarcode.store_id == store.id, ProductBarcode.source == "manufacturer",
        )) == 31
        assert db.scalar(select(func.count()).select_from(MediaAsset).where(MediaAsset.store_id == store.id)) == 25
        assert db.scalar(select(func.count()).select_from(StoreActivity).where(StoreActivity.store_id == store.id)) == 20
        assert audit(db)["status"] == "PASS"
    engine.dispose()


def test_partial_seed_failure_rolls_back_the_profile(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'qa-rollback.db').as_posix()}")
    Base.metadata.create_all(engine)
    original = seeder._seed_store
    calls = 0

    def fail_after_first(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("synthetic failure")
        return original(*args, **kwargs)

    monkeypatch.setattr(seeder, "_seed_store", fail_after_first)
    with Session(engine) as db:
        with pytest.raises(RuntimeError, match="synthetic failure"):
            seed_profile(db, "comprehensive", password="Gate7-test-password-123!")
        assert current_counts(db) == {
            "users": 0, "stores": 0, "products": 0,
            "counterparties": 0, "invoices": 0, "barcodes": 0,
        }
    engine.dispose()
