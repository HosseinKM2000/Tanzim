from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import Base, engine
from app.main import app
from app.models import CentralLog, LogApp, LogRule


@pytest.fixture(scope="module", autouse=True)
def setup_database_and_dispose():
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        app_row = session.get(LogApp, "test-app")
        if not app_row:
            app_row = LogApp(id="test-app", name="Test App", api_key="secret-key-123", is_active=True)
            session.add(app_row)
            session.commit()
    yield
    engine.dispose()


def test_ingest_central_logs_success():
    payload = {
        "events": [
            {
                "level": "error",
                "category": "inventory",
                "action": "stock_sync_failed",
                "title": "خطای همگام‌سازی موجودی قطعات",
                "message": "Connection timeout",
                "storeId": 105,
                "phone": "09121112233",
                "metadata": {"sku": "BOSCH-SPARK-01"},
                "context": {"path": "/api/v1/inventory/sync", "device": "Android App"},
            }
        ]
    }
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            "/api/v1/logs/ingest",
            json=payload,
            headers={
                "X-App-Id": "test-app",
                "Authorization": "Bearer secret-key-123",
            },
        )
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "ok"
    assert data["accepted"] == 1

    with Session(engine) as session:
        log_row = session.query(CentralLog).filter(CentralLog.app_id == "test-app").first()
        assert log_row is not None
        assert log_row.action == "stock_sync_failed"
        assert log_row.level == "error"
        assert log_row.store_id == 105


def test_ingest_central_logs_unauthorized():
    payload = {
        "events": [
            {
                "level": "info",
                "category": "auth",
                "action": "login",
                "title": "ورود کاربر",
            }
        ]
    }
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            "/api/v1/logs/ingest",
            json=payload,
            headers={
                "X-App-Id": "test-app",
                "Authorization": "Bearer wrong-key",
            },
        )
    assert resp.status_code == 403


def test_ack_and_mute_logs():
    with Session(engine) as session:
        log_row = CentralLog(
            app_id="test-app",
            level="error",
            category="ocr",
            action="ocr_timeout",
            title="تایم‌اوت OCR",
        )
        session.add(log_row)
        session.commit()
        log_id = log_row.id

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post("/api/v1/logs/ack", json={"logId": log_id, "ackBy": "Milad"})
        assert resp.status_code == 200
        assert resp.json()["acknowledged"] is True

        resp = client.post("/api/v1/logs/mute", json={"appId": "test-app", "category": "ocr", "hours": 2})
        assert resp.status_code == 200
        assert resp.json()["mutedHours"] == 2


def test_ingest_visit_and_operation_logs():
    payload = {
        "events": [
            {
                "level": "info",
                "category": "visit",
                "action": "view_article",
                "title": "مطالعه مقاله سامانه مودیان",
                "context": {"path": "/blog/samaneh-moadian", "device": "Chrome Windows"},
                "metadata": {"slug": "samaneh-moadian"},
            },
            {
                "level": "info",
                "category": "operation",
                "action": "invoice_create",
                "title": "صدور فاکتور رسمی",
                "storeId": 204,
                "phone": "09121112233",
                "message": "فاکتور فروش شماره ۱۴۰۵ صادر شد",
            },
        ]
    }
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            "/api/v1/logs/ingest",
            json=payload,
            headers={
                "X-App-Id": "test-app",
                "X-App-Token": "secret-key-123",
            },
        )
    assert resp.status_code == 202
    assert resp.json()["accepted"] == 2

    with Session(engine) as session:
        visit_row = session.query(CentralLog).filter(CentralLog.action == "view_article").first()
        assert visit_row is not None
        assert visit_row.category == "visit"
        assert visit_row.title == "مطالعه مقاله سامانه مودیان"

        op_row = session.query(CentralLog).filter(CentralLog.action == "invoice_create").first()
        assert op_row is not None
        assert op_row.category == "operation"
        assert op_row.store_id == 204

