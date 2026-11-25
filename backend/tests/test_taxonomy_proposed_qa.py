"""QA-only proposed taxonomy v2: structural validation and fail-closed gating."""

import json
from pathlib import Path

import pytest

from app.config import settings
from app.services.canonical_taxonomy_seed import (
    SOURCE,
    SOURCE_PROPOSED_QA,
    _source,
)
from app.services.taxonomy_service import (
    PROPOSED_QA_TAXONOMY_VERSION,
    TAXONOMY_VERSION,
    active_taxonomy_version,
    proposed_taxonomy_enabled,
)

SECTORS = 24
APPROVED = 25
PROPOSED = 337
TOTAL = APPROVED + PROPOSED


def _data() -> dict:
    return json.loads(SOURCE_PROPOSED_QA.read_text(encoding="utf-8"))


def _use_qa(monkeypatch, *, environment="test", flag=True, version=PROPOSED_QA_TAXONOMY_VERSION):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "QA_PROPOSED_TAXONOMY_ENABLED", flag)
    monkeypatch.setattr(settings, "TAXONOMY_VERSION_OVERRIDE", version)


def test_default_source_is_untouched_v1():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    assert data["taxonomy_version"] == TAXONOMY_VERSION
    assert data["sector_count"] == SECTORS
    assert data["parent_category_count"] == 281
    assert data["approved_parent_category_count"] == APPROVED
    assert data["proposed_parent_category_count"] == 256
    assert SOURCE.read_bytes() != SOURCE_PROPOSED_QA.read_bytes()


def test_proposed_v2_dataset_is_structurally_complete():
    data = _data()
    assert data["taxonomy_version"] == PROPOSED_QA_TAXONOMY_VERSION
    assert data["sector_count"] == SECTORS
    assert data["parent_category_count"] == TOTAL
    assert data["approved_parent_category_count"] == APPROVED
    assert data["proposed_parent_category_count"] == PROPOSED
    assert data["runtime_contract"]["qa_activation_flag"] == "QA_PROPOSED_TAXONOMY_ENABLED"
    assert data["runtime_contract"]["proposed_categories_default_enabled"] is False

    sectors = data["sectors"]
    assert [sector["code"] for sector in sectors] == [f"{number:02d}" for number in range(1, 25)]
    keys: set[str] = set()
    total = approved = 0
    for sector in sectors:
        codes = [category["code"] for category in sector["categories"]]
        assert len(codes) == len(set(codes)), sector["code"]
        assert all(code.isdigit() and 1 <= int(code) <= 99 for code in codes), sector["code"]
        names = [" ".join(category["name_fa"].split()) for category in sector["categories"]]
        assert len(names) == len(set(names)), sector["code"]
        for category in sector["categories"]:
            assert category["approval_status"] in {"approved", "proposed"}
            assert category["reference_key"] == f"category:{sector['code']}:{category['code']}"
            assert category["reference_key"] not in keys
            keys.add(category["reference_key"])
        total += len(codes)
        approved += sum(category["approval_status"] == "approved" for category in sector["categories"])
    assert total == TOTAL
    assert approved == APPROVED

    automotive = sectors[0]
    assert automotive["code"] == "01"
    assert len(automotive["categories"]) == 25
    assert {category["approval_status"] for category in automotive["categories"]} == {"approved"}
    assert {category["code"] for category in automotive["categories"]} == {
        f"{number:02d}" for number in range(1, 26)
    }


def test_v2_preserves_every_v1_code_and_name():
    v1 = json.loads(SOURCE.read_text(encoding="utf-8"))
    v2 = _data()
    v2_sectors = {sector["code"]: sector for sector in v2["sectors"]}
    for sector in v1["sectors"]:
        target = v2_sectors[sector["code"]]
        assert target["name_fa"] == sector["name_fa"]
        assert target["custom_categories_allowed"] == sector["custom_categories_allowed"]
        existing = {category["code"]: category for category in target["categories"]}
        for category in sector["categories"]:
            assert existing[category["code"]]["name_fa"] == category["name_fa"]
            assert existing[category["code"]]["approval_status"] == category["approval_status"]


def test_active_version_follows_override_only_outside_production(monkeypatch):
    monkeypatch.setattr(settings, "TAXONOMY_VERSION_OVERRIDE", "")
    monkeypatch.setattr(settings, "QA_PROPOSED_TAXONOMY_ENABLED", False)
    assert active_taxonomy_version() == TAXONOMY_VERSION
    assert proposed_taxonomy_enabled() is False

    monkeypatch.setattr(settings, "TAXONOMY_VERSION_OVERRIDE", PROPOSED_QA_TAXONOMY_VERSION)
    assert active_taxonomy_version() == PROPOSED_QA_TAXONOMY_VERSION
    for environment in ("development", "production", "staging"):
        monkeypatch.setattr(settings, "ENVIRONMENT", environment)
        monkeypatch.setattr(settings, "QA_PROPOSED_TAXONOMY_ENABLED", True)
        assert proposed_taxonomy_enabled() is False, environment


@pytest.mark.parametrize(
    "flag,version",
    ((False, PROPOSED_QA_TAXONOMY_VERSION), (True, ""), (True, TAXONOMY_VERSION)),
)
def test_proposed_gate_requires_flag_and_non_default_version(monkeypatch, flag, version):
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setattr(settings, "QA_PROPOSED_TAXONOMY_ENABLED", flag)
    monkeypatch.setattr(settings, "TAXONOMY_VERSION_OVERRIDE", version)
    assert proposed_taxonomy_enabled() is False


def test_source_loader_selects_version_and_rejects_unknown(monkeypatch):
    _use_qa(monkeypatch)
    data, result = _source()
    assert result.taxonomy_version == PROPOSED_QA_TAXONOMY_VERSION
    assert (result.sector_count, result.approved_category_count, result.proposed_category_count) == (
        SECTORS,
        APPROVED,
        PROPOSED,
    )
    assert len(result.content_sha256) == 64
    assert len(data["sectors"]) == SECTORS

    monkeypatch.setattr(settings, "TAXONOMY_VERSION_OVERRIDE", "scb-2099-01-01-v9-unknown")
    with pytest.raises(RuntimeError, match="CANONICAL_TAXONOMY_VERSION_UNSUPPORTED"):
        _source()


def test_proposed_file_stays_disposable_reference_data():
    path = Path(SOURCE_PROPOSED_QA)
    assert path.name.endswith("_v2_proposed_qa.json")
    assert path.parent.name == "reference_data"
