from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..config import settings
from ..models import PasswordRecoveryEvent
from ..mobile import normalize_iranian_mobile


def _canonical_identifier(value: str) -> str:
    candidate = value.strip()
    try:
        return normalize_iranian_mobile(candidate)
    except ValueError:
        return candidate.casefold()


def _digest(namespace: str, value: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"password-recovery:{namespace}:{value}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _advisory_lock(db: Session, digest: str) -> None:
    if db.bind is None or db.bind.dialect.name != "postgresql":
        return
    key = int.from_bytes(bytes.fromhex(digest[:16]), "big", signed=True)
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


def request_recovery(db: Session, *, identifier: str, source: str) -> int | None:
    """Record a generic request without resolving identity or issuing a credential.

    Tanzim currently has no verified delivery channel. Looking up the supplied
    identifier would add enumeration/timing risk without enabling a safe reset.
    """

    identifier_hash = _digest("identifier", _canonical_identifier(identifier))
    source_hash = _digest("source", source.strip() or "unknown")
    for digest in sorted((identifier_hash, source_hash)):
        _advisory_lock(db, digest)

    now = datetime.now(timezone.utc)
    window = timedelta(minutes=settings.PASSWORD_RECOVERY_WINDOW_MINUTES)
    cutoff = now - window
    identifier_count = db.scalar(select(func.count()).select_from(PasswordRecoveryEvent).where(
        PasswordRecoveryEvent.identifier_hash == identifier_hash,
        PasswordRecoveryEvent.requested_at >= cutoff,
    )) or 0
    source_count = db.scalar(select(func.count()).select_from(PasswordRecoveryEvent).where(
        PasswordRecoveryEvent.source_hash == source_hash,
        PasswordRecoveryEvent.requested_at >= cutoff,
    )) or 0
    limited = (
        identifier_count >= settings.PASSWORD_RECOVERY_IDENTIFIER_LIMIT
        or source_count >= settings.PASSWORD_RECOVERY_SOURCE_LIMIT
    )
    db.add(PasswordRecoveryEvent(
        identifier_hash=identifier_hash,
        source_hash=source_hash,
        outcome="rate_limited" if limited else "channel_unavailable",
        requested_at=now,
    ))
    db.commit()
    return max(1, int(window.total_seconds())) if limited else None
