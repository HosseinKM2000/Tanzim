"""
Tests for Tanzim Invoice OCR parsing and API endpoints.
"""
import hashlib
import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.services.bootstrap_service import ensure_system_admin
from app.services.ocr_service import (
    latin_digits,
    normalize_persian_text,
    parse_ocr_text,
    parse_persian_number,
)
from app.services.subscription_service import seed_default_plans


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_default_plans(db)
        ensure_system_admin(db)
    with TestClient(app) as value:
        yield value
    engine.dispose()


def test_persian_number_parsing():
    assert parse_persian_number("۱۲۳۴۵") == 12345
    # Shorthand thousands (-/85 -> 85000)
    assert parse_persian_number("-/85") == 85000
    assert parse_persian_number("85/-") == 85000
    assert parse_persian_number("-/۸۵") == 85000
    # Slash separators
    assert parse_persian_number("40/000") == 40000
    assert parse_persian_number("۲۳۰/۰۰۰") == 230000
    # Comma separators
    assert parse_persian_number("۱,۵۰۰,۰۰۰") == 1500000
    assert parse_persian_number("1,250,000") == 1250000
    # Clean fallback
    assert parse_persian_number("") is None
    assert parse_persian_number("نامعتبر") is None


def test_normalize_persian():
    raw = "فروشگاه  قطعات يدكي\u200cخودرو"
    normalized = normalize_persian_text(raw)
    assert "یدکی" in normalized
    assert "  " not in normalized


def test_parse_ocr_markdown_table():
    sample_md = """
    شماره فاکتور: ۴۴۷
    فروشنده: شرکت پخش لوازم یدکی آریا
    تاریخ: ۱۴۰۵/۰۸/۲۵

    | ردیف | شرح کالا | تعداد | واحد | فی | مبلغ کل |
    | :--- | :--- | :--- | :--- | :--- | :--- |
    | ۱ | لنت ترمز جلو پراید | ۴ | دست | ۴۲۰/۰۰۰ | ۱/۶۸۰/۰۰۰ |
    | ۲ | شمع موتور انژکتور بوش | ۸ | عدد | ۹۵/۰۰۰ | ۷۶۰/۰۰۰ |
    | ۳ | تسمه تایم دانگیل ۲۰۶ | ۲ | عدد | ۳۸۰/۰۰۰ | ۷۶۰/۰۰۰ |

    جمع کل: ۳/۲۰۰/۰۰۰
    """
    result = parse_ocr_text(sample_md, currency_preference="toman")
    assert result["quality"]["ok"] is True
    assert "آریا" in (result["supplier_name"] or "")
    assert result["invoice_no"] == "447"
    assert len(result["lines"]) == 3

    line1 = result["lines"][0]
    assert "لنت ترمز" in line1["name_raw"]
    assert line1["quantity"] == 4
    assert line1["unit_price"] == 420000
    assert line1["line_total"] == 1680000
    assert line1["verified"] is True

    line2 = result["lines"][1]
    assert "شمع موتور" in line2["name_raw"]
    assert line2["quantity"] == 8
    assert line2["unit_price"] == 95000
    assert line2["line_total"] == 760000
    assert line2["verified"] is True


def test_parse_ocr_rial_conversion():
    sample_md = """
    فروشگاه قطعات الکتریک پارس
    فاکتور فروش: 1089
    واحد پول: ریال

    | ردیف | شرح کالا | تعداد | فی | مبلغ |
    | :--- | :--- | :--- | :--- | :--- |
    | ۱ | کلید مینیاتوری تک پل | ۱۰ | ۴,۵۰۰,۰۰۰ | ۴۵,۰۰۰,۰۰۰ |

    مبلغ کل: ۴۵,۰۰۰,۰۰۰ ریال
    """
    result = parse_ocr_text(sample_md, currency_preference="rial")
    assert len(result["lines"]) == 1
    line = result["lines"][0]
    # In rials: 4,500,000 rials = 450,000 tomans
    assert line["unit_price"] == 450000
    assert line["line_total"] == 4500000
    assert line["verified"] is True


def test_api_sample_invoice_ocr(client: TestClient):
    username = "ocr_test_owner"
    digits = int(hashlib.sha256(username.encode()).hexdigest()[:12], 16) % 1_000_000_000
    signup_resp = client.post("/api/auth/signup", json={
        "first_name": "OCR", "last_name": "Tester", "username": username,
        "phone": f"09{digits:09d}",
        "password": "StrongPassword123!", "device_fingerprint": f"device-{username}",
    })
    assert signup_resp.status_code == 201
    auth_data = signup_resp.json()
    auth_headers = {
        "Authorization": f"Bearer {auth_data['access_token']}",
        "X-Device-Fingerprint": f"device-{username}",
    }

    response = client.post(
        "/api/invoices/ocr",
        headers=auth_headers,
        json={"sample": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert "lines" in data
    assert len(data["lines"]) > 0
    assert data["quality"]["ok"] is True
    assert data.get("sample") is True
