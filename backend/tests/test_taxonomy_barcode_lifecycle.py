import json
import re
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.config import settings
from app.main import app
from app.models import (
    BarcodeReservation,
    Category,
    Industry,
    InventoryItem,
    ProductBarcode,
    ReferenceCategory,
    ReferenceSector,
    Store,
    User,
)
from app.services.bootstrap_service import ensure_system_admin
from app.services.subscription_service import seed_default_plans
from app.services.taxonomy_service import TAXONOMY_VERSION, reserve_external_barcode


@pytest.fixture(autouse=True)
def _dispose_test_engine():
    previous_adoption_gate = settings.TAXONOMY_ADOPTION_ENABLED
    settings.TAXONOMY_ADOPTION_ENABLED = False
    yield
    settings.TAXONOMY_ADOPTION_ENABLED = previous_adoption_gate
    engine.dispose()


def _seed_reference_contract() -> None:
    source = Path(__file__).parents[1] / "app" / "reference_data" / "tanzim_sector_categories_v1.json"
    data = json.loads(source.read_text(encoding="utf-8"))
    with SessionLocal() as db:
        if db.scalar(select(ReferenceSector.id).limit(1)) is not None:
            return
        for sector_data in data["sectors"]:
            sector = ReferenceSector(
                id=int(sector_data["code"]),
                reference_key=sector_data["reference_key"],
                code=sector_data["code"],
                name_fa=sector_data["name_fa"],
                taxonomy_version=TAXONOMY_VERSION,
                custom_categories_allowed=sector_data["custom_categories_allowed"],
                label_status=sector_data["sector_label_status"],
            )
            db.add(sector)
            db.flush()
            db.add(Industry(
                name=f"مرجع {sector_data['code']} {sector_data['name_fa']}",
                description="synthetic test mapping",
                is_active=True,
                reference_sector_id=sector.id,
                sector_code=sector.code,
                taxonomy_version=TAXONOMY_VERSION,
            ))
            for category_data in sector_data["categories"]:
                db.add(ReferenceCategory(
                    id=int(sector.code) * 100 + int(category_data["code"]),
                    sector_id=sector.id,
                    reference_key=category_data["reference_key"],
                    code=category_data["code"],
                    name_fa=category_data["name_fa"],
                    examples_json=json.dumps(category_data["examples_fa"], ensure_ascii=False),
                    approval_status=category_data["approval_status"],
                    taxonomy_version=TAXONOMY_VERSION,
                ))
        db.commit()


def _signup(client: TestClient) -> tuple[dict[str, str], int]:
    suffix = uuid.uuid4().hex[:10]
    response = client.post("/api/auth/signup", json={
        "first_name": "Taxonomy",
        "last_name": "Owner",
        "username": f"taxonomy-{suffix}",
        "phone": f"09{int(suffix, 16) % 1_000_000_000:09d}",
        "password": "StrongPass123!",
        "device_fingerprint": f"taxonomy-device-{suffix}",
    })
    assert response.status_code == 201, response.text
    return {
        "Authorization": f"Bearer {response.json()['access_token']}",
        "X-Device-Fingerprint": f"taxonomy-device-{suffix}",
        "X-Client-Data-Schema": "2",
    }, response.json()["user"]["id"]


def test_adoption_gates_reference_data_and_preserves_barcode_reservations() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_default_plans(db)
        ensure_system_admin(db)
    _seed_reference_contract()

    with TestClient(app) as client:
        headers, user_id = _signup(client)
        sectors = client.get("/api/taxonomy/sectors", headers=headers)
        assert sectors.status_code == 200
        assert len(sectors.json()) == 24

        proposed_only = client.get("/api/taxonomy/sectors/02/categories", headers=headers)
        assert proposed_only.status_code == 200
        assert proposed_only.json() == []

        state = client.get("/api/taxonomy/state", headers=headers).json()
        assert state["adoption_enabled"] is False
        disabled = client.post("/api/taxonomy/adopt", headers=headers, json={
            "sector_code": "01",
            "expected_policy_version": state["taxonomy_policy_version"],
        })
        assert disabled.status_code == 503
        assert disabled.json()["detail"] == "TAXONOMY_ADOPTION_DISABLED"
        settings.TAXONOMY_ADOPTION_ENABLED = True
        adopted = client.post("/api/taxonomy/adopt", headers=headers, json={
            "sector_code": "01",
            "expected_policy_version": state["taxonomy_policy_version"],
        })
        assert adopted.status_code == 200, adopted.text
        with SessionLocal() as db:
            adopted_store = db.scalar(select(Store).where(Store.owner_user_id == user_id))
            assert adopted_store is not None
            reference_industry_id = adopted_store.industry_id
        bypass = client.patch("/api/auth/industry", headers=headers, json={"industry_id": reference_industry_id})
        assert bypass.status_code == 409
        assert bypass.json()["detail"] == "TAXONOMY_ADOPTION_ENDPOINT_REQUIRED"

        categories = client.get("/api/categories", headers=headers)
        assert categories.status_code == 200
        assert len(categories.json()) == 25
        assert {item["origin"] for item in categories.json()} == {"system"}
        category_id = categories.json()[0]["id"]
        category_code = categories.json()[0]["code"]

        missing_category = client.post("/api/products", headers=headers, data={"name": "بدون دسته"})
        assert missing_category.status_code == 422
        assert missing_category.json()["detail"] == "CATEGORY_REQUIRED_AFTER_ADOPTION"

        created = client.post("/api/products", headers=headers, data={
            "name": "قطعه آزمایشی", "category_id": str(category_id), "quantity": "2", "price": "1000",
        })
        assert created.status_code == 201, created.text
        product_id = created.json()["id"]

        with SessionLocal() as db:
            barcode = db.scalar(select(ProductBarcode).where(ProductBarcode.product_id == product_id))
            assert barcode is not None
            assert re.fullmatch(r"TZ1-01-\d{2}-[0-9A-HJKMNP-TV-Z]{26}", barcode.value)
            assert barcode.lifecycle_status == "active"
            reservation_id = barcode.reservation_id
            value = barcode.value

            external_value = " 001AbC "
            external = reserve_external_barcode(db, store_id=barcode.store_id, product_id=product_id, value=external_value)
            db.add(ProductBarcode(
                store_id=barcode.store_id,
                product_id=product_id,
                value=external.value,
                source="manufacturer",
                symbology="code128",
                meaning="unit",
                scan_quantity=1,
                is_active=True,
                is_default=False,
                lifecycle_status="active",
                reservation_id=external.id,
            ))
            db.commit()
            assert external.value == external_value

        resolved = client.get("/api/taxonomy/barcodes/resolve", headers=headers, params={"value": value})
        assert resolved.status_code == 200
        assert resolved.json()["status"] == "active"

        solo_product_id = 7_100_000_000_001
        solo_barcode_id = 7_100_000_000_002
        solo_value = f"TZ1-01-{category_code}-0123456789ABCDEFGHJKMNPQRS"
        with SessionLocal() as db:
            store = db.scalar(select(Store).where(Store.owner_user_id == user_id))
            assert store is not None
            owner = db.get(User, user_id)
            assert owner is not None
            owner.plan = store.plan = "pro"
            policy_version = store.policy_version
            db.commit()
        solo_operation = {
            "operation_id": f"solo-create-{uuid.uuid4().hex}",
            "entity": "product",
            "entity_id": solo_product_id,
            "operation": "CREATE",
            "execution_mode": "solo",
            "policy_version": policy_version,
            "payload": {
                "quantity": 1,
                "sale_price": 500,
                "category_id": category_id,
                "custom_label": "کالای آفلاین",
                "catalog_product": {"id": 0, "name": "کالای آفلاین"},
                "internal_barcode": {
                    "id": solo_barcode_id,
                    "product_id": solo_product_id,
                    "value": solo_value,
                    "source": "tanzim",
                    "symbology": "code128",
                    "meaning": "unit",
                    "scan_quantity": 1,
                    "is_active": True,
                    "is_default": True,
                },
            },
        }
        accepted_solo = client.post(
            "/api/sync/batch",
            headers=headers,
            data={"operations_json": json.dumps({"operations": [solo_operation]})},
        )
        assert accepted_solo.status_code == 200, accepted_solo.text
        assert accepted_solo.json()["results"][0]["status"] == "applied", accepted_solo.text
        with SessionLocal() as db:
            durable = db.get(ProductBarcode, solo_barcode_id)
            assert durable is not None and durable.value == solo_value
        replay = client.post(
            "/api/sync/batch",
            headers=headers,
            data={"operations_json": json.dumps({"operations": [solo_operation]})},
        )
        assert replay.json()["results"] == accepted_solo.json()["results"]

        destination_id = categories.json()[1]["id"]
        preview = client.post("/api/taxonomy/recategorization/preview", headers=headers, json={
            "product_ids": [product_id], "destination_category_id": destination_id,
        })
        assert preview.status_code == 200, preview.text
        confirmation = preview.json()
        confirmed = client.post("/api/taxonomy/recategorization/confirm", headers=headers, json={
            "destination_category_id": destination_id,
            "targets": confirmation["targets"],
            "expires_at": confirmation["expires_at"],
            "confirmation_token": confirmation["confirmation_token"],
            "operation_id": f"recat-{uuid.uuid4().hex}",
        })
        assert confirmed.status_code == 200, confirmed.text
        replacement_value = confirmed.json()["replacements"][0]["barcode"]
        assert replacement_value != value
        assert client.get("/api/taxonomy/barcodes/resolve", headers=headers, params={"value": value}).json()["status"] == "retired"
        exact_external = client.get(
            "/api/taxonomy/barcodes/resolve",
            headers=headers,
            params={"value": " 001AbC "},
        ).json()
        assert exact_external["status"] == "active"
        assert exact_external["value"] == " 001AbC "
        assert client.get(
            "/api/taxonomy/barcodes/resolve",
            headers=headers,
            params={"value": "001AbC"},
        ).json()["status"] == "not_found"

        deleted = client.delete(f"/api/products/{product_id}", headers=headers)
        assert deleted.status_code == 204
        unavailable = client.get("/api/taxonomy/barcodes/resolve", headers=headers, params={"value": value})
        assert unavailable.json()["status"] == "unavailable"
        with SessionLocal() as db:
            reservation = db.get(BarcodeReservation, reservation_id)
            assert reservation is not None
            assert reservation.status == "deleted"
            store = db.scalar(select(Store).where(Store.owner_user_id == user_id))
            assert store is not None and store.has_historical_inventory_usage
    engine.dispose()


def test_custom_category_deactivation_preserves_products_and_can_reactivate() -> None:
    settings.TAXONOMY_ADOPTION_ENABLED = True
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_default_plans(db)
        ensure_system_admin(db)
    _seed_reference_contract()

    with TestClient(app) as client:
        headers, _ = _signup(client)
        state = client.get("/api/taxonomy/state", headers=headers).json()
        adopted = client.post("/api/taxonomy/adopt", headers=headers, json={
            "sector_code": "02",
            "expected_policy_version": state["taxonomy_policy_version"],
        })
        assert adopted.status_code == 200, adopted.text
        assert client.get("/api/taxonomy/sectors/02/categories", headers=headers).json() == []

        created_category = client.post("/api/categories", headers=headers, json={
            "name": "دسته اختصاصی تست",
            "description": "بدون کپی از پیشنهادها",
        })
        assert created_category.status_code == 201, created_category.text
        category = created_category.json()
        assert category["origin"] == "custom"
        assert category["is_active"] is True

        created_product = client.post("/api/products", headers=headers, data={
            "name": "کالای دسته اختصاصی",
            "category_id": str(category["id"]),
            "quantity": "1",
            "price": "1000",
        })
        assert created_product.status_code == 201, created_product.text
        product_id = created_product.json()["id"]

        deactivated = client.delete(f"/api/categories/{category['id']}", headers=headers)
        assert deactivated.status_code == 204, deactivated.text
        with SessionLocal() as db:
            persisted_category = db.get(Category, category["id"])
            product = db.get(InventoryItem, product_id)
            assert persisted_category is not None and persisted_category.is_active is False
            assert product is not None and product.category_id == category["id"]

        blocked = client.post("/api/products", headers=headers, data={
            "name": "کالای مقصد غیرفعال",
            "category_id": str(category["id"]),
        })
        assert blocked.status_code == 400
        assert blocked.json()["detail"] == "CATEGORY_NOT_AVAILABLE"

        reactivated = client.patch(f"/api/categories/{category['id']}", headers=headers, json={"is_active": True})
        assert reactivated.status_code == 200, reactivated.text
        assert reactivated.json()["is_active"] is True
    engine.dispose()
