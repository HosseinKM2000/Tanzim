from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..config import settings
from ..models import AppLog

logger = logging.getLogger("tanzim.app")

_DEDUPE_LOCK = threading.Lock()
_RECENT_ALERTS: dict[str, float] = {}
_DEDUPE_WINDOW_SECONDS = 60.0

_LEVEL_EMOJI = {
    "critical": "🔴 CRITICAL",
    "error": "🟠 ERROR",
    "warn": "🟡 WARN",
    "warning": "🟡 WARN",
    "info": "🔵 INFO",
}


def _should_send_alert(dedupe_key: str, cooldown_seconds: float = _DEDUPE_WINDOW_SECONDS) -> bool:
    now = time.monotonic()
    with _DEDUPE_LOCK:
        expired = [key for key, ts in _RECENT_ALERTS.items() if now - ts > cooldown_seconds * 4]
        for key in expired:
            _RECENT_ALERTS.pop(key, None)
        last = _RECENT_ALERTS.get(dedupe_key)
        if last is not None and now - last < cooldown_seconds:
            return False
        _RECENT_ALERTS[dedupe_key] = now
        return True


def _post_telewhat_sync(text: str) -> None:
    if not settings.TELEWHAT_ENABLED or not settings.TELEWHAT_RELAY_URL or not settings.TELEWHAT_TG_TARGET:
        return
    if settings.ENVIRONMENT == "test":
        return
    payload = json.dumps({
        "to": settings.TELEWHAT_TG_TARGET,
        "platform": "tg",
        "direct": True,
        "text": text[:3500],
    }).encode("utf-8")
    req = urllib.request.Request(
        settings.TELEWHAT_RELAY_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp.read()
    except Exception as exc:
        logger.warning("telewhat relay delivery failed: %s", exc)


def send_telewhat_alert(
    *,
    level: str,
    source: str,
    event: str,
    message: str,
    user_id: int | None = None,
    store_id: int | None = None,
    request_id: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    details: dict[str, Any] | None = None,
    dedupe: bool = True,
) -> None:
    """Deliver a structured Tanzim log alert to Telegram via the telewhat bridge asynchronously."""
    if not settings.TELEWHAT_ENABLED or settings.ENVIRONMENT == "test":
        return
    if dedupe:
        key_raw = f"{level}:{source}:{event}:{path or ''}:{status_code or ''}:{message[:120]}"
        key = hashlib.sha256(key_raw.encode("utf-8")).hexdigest()[:24]
        if not _should_send_alert(key):
            return

    badge = _LEVEL_EMOJI.get(level.lower(), "🔵 INFO")
    lines = [
        f"{badge} | تنظیم ({source})",
        f"رویداد: {event}",
        f"پیام: {message}",
    ]
    meta_parts: list[str] = []
    if path:
        meta_parts.append(f"مسیر: {path}")
    if status_code is not None:
        meta_parts.append(f"کد: {status_code}")
    if user_id is not None:
        meta_parts.append(f"کاربر: {user_id}")
    if store_id is not None:
        meta_parts.append(f"فروشگاه: {store_id}")
    if meta_parts:
        lines.append(" | ".join(meta_parts))
    if request_id:
        lines.append(f"Request-ID: {request_id}")
    if details:
        try:
            compact = json.dumps(details, ensure_ascii=False)
            if len(compact) > 600:
                compact = compact[:600] + "..."
            lines.append(f"جزئیات: {compact}")
        except Exception:
            pass
    lines.append(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"))
    body = "\n".join(lines)

    thread = threading.Thread(target=_post_telewhat_sync, args=(body,), daemon=True)
    thread.start()


def record_app_log(
    db: Session | None,
    *,
    level: str,
    source: str,
    event: str,
    message: str,
    user_id: int | None = None,
    store_id: int | None = None,
    request_id: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    notify_telegram: bool = False,
    dedupe_telegram: bool = True,
) -> AppLog | None:
    """Persist an application log record and optionally forward it to Telegram via telewhat."""
    clean_level = (level or "info").strip().lower()[:20]
    clean_source = (source or "backend").strip().lower()[:32]
    clean_event = (event or "event").strip()[:80]
    clean_message = (message or "").strip()[:4000] or clean_event

    log_fn = logger.error if clean_level in {"error", "critical"} else logger.warning if clean_level in {"warn", "warning"} else logger.info
    log_fn(
        "[%s/%s] %s | user=%s store=%s path=%s status=%s req=%s",
        clean_source,
        clean_event,
        clean_message,
        user_id,
        store_id,
        path,
        status_code,
        request_id,
    )

    row: AppLog | None = None
    if db is not None:
        try:
            row = AppLog(
                created_at=datetime.now(timezone.utc),
                level=clean_level,
                source=clean_source,
                event=clean_event,
                user_id=user_id,
                store_id=store_id,
                request_id=request_id[:64] if request_id else None,
                path=path[:255] if path else None,
                status_code=status_code,
                message=clean_message,
                details_json=json.dumps(details, ensure_ascii=False) if details else None,
                ip_address=ip_address[:64] if ip_address else None,
                user_agent=user_agent[:512] if user_agent else None,
            )
            db.add(row)
            db.commit()
        except Exception as exc:
            logger.warning("Failed to persist AppLog row: %s", exc)
            try:
                db.rollback()
            except Exception:
                pass
            row = None

    if notify_telegram:
        send_telewhat_alert(
            level=clean_level,
            source=clean_source,
            event=clean_event,
            message=clean_message,
            user_id=user_id,
            store_id=store_id,
            request_id=request_id,
            path=path,
            status_code=status_code,
            details=details,
            dedupe=dedupe_telegram,
        )
    return row
