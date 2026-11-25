import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import PasswordRecoveryEvent, User, UserSession


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as value:
        yield value


def _signup(client: TestClient, username: str) -> tuple[int, str]:
    response = client.post("/api/auth/signup", json={
        "username": username,
        "phone": f"09{int(uuid.uuid4().hex[:10], 16) % 1_000_000_000:09d}",
        "password": "StrongPass123!",
        "device_fingerprint": f"recovery-device-{username}",
    })
    assert response.status_code == 201, response.text
    return response.json()["user"]["id"], response.json()["access_token"]


def test_recovery_request_is_enumeration_safe_and_does_not_mutate_identity(client: TestClient):
    username = f"recovery-{uuid.uuid4().hex[:8]}"
    user_id, token = _signup(client, username)
    unknown = f"missing-{uuid.uuid4().hex[:8]}"

    existing_response = client.post("/api/auth/recovery/request", json={"identifier": username})
    unknown_response = client.post("/api/auth/recovery/request", json={"identifier": unknown})

    assert existing_response.status_code == unknown_response.status_code == 202
    assert existing_response.json() == unknown_response.json() == {
        "message": "PASSWORD_RECOVERY_REQUEST_ACCEPTED",
        "delivery_available": False,
    }
    with SessionLocal() as db:
        user = db.get(User, user_id)
        assert user is not None
        assert user.hashed_password
        assert db.scalar(select(func.count()).select_from(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.access_token == token,
            UserSession.is_active.is_(True),
        )) == 1
        events = list(db.scalars(select(PasswordRecoveryEvent).order_by(PasswordRecoveryEvent.id.desc()).limit(2)))
        assert len(events) == 2
        assert all(event.outcome == "channel_unavailable" for event in events)
        assert all(username not in event.identifier_hash and unknown not in event.identifier_hash for event in events)


def test_recovery_rejects_client_supplied_credentials(client: TestClient):
    response = client.post("/api/auth/recovery/request", json={
        "identifier": "someone",
        "token": "client-must-not-supply-reset-material",
    })
    assert response.status_code == 422


def test_recovery_request_limits_repeat_and_allows_after_window(client: TestClient):
    identifier = f"rate-{uuid.uuid4().hex[:8]}"
    for _ in range(settings.PASSWORD_RECOVERY_IDENTIFIER_LIMIT):
        assert client.post("/api/auth/recovery/request", json={"identifier": identifier}).status_code == 202

    limited = client.post("/api/auth/recovery/request", json={"identifier": identifier})
    assert limited.status_code == 429
    assert limited.json()["detail"] == "PASSWORD_RECOVERY_RATE_LIMITED"
    assert int(limited.headers["Retry-After"]) >= 1

    with SessionLocal() as db:
        latest = db.scalar(select(PasswordRecoveryEvent).where(
            PasswordRecoveryEvent.outcome == "rate_limited",
        ).order_by(PasswordRecoveryEvent.id.desc()))
        latest.requested_at = datetime.now(timezone.utc) - timedelta(
            minutes=settings.PASSWORD_RECOVERY_WINDOW_MINUTES + 1,
        )
        matching_hash = latest.identifier_hash
        for event in db.scalars(select(PasswordRecoveryEvent).where(
            PasswordRecoveryEvent.identifier_hash == matching_hash,
        )):
            event.requested_at = latest.requested_at
        db.commit()

    assert client.post("/api/auth/recovery/request", json={"identifier": identifier}).status_code == 202
