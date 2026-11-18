import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
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
            "users": 4, "stores": 3, "products": 72,
            "counterparties": 6, "invoices": 6, "barcodes": 72,
        }
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
