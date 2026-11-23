from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import CentralLog, LogApp, LogRule

logger = logging.getLogger("tanzim.central_logger")

LEVEL_ORDER = {
    "debug": 0,
    "info": 1,
    "warn": 2,
    "error": 3,
    "critical": 4,
    "audit": 5,
}

_DEDUPE_LOCK = threading.Lock()
_RECENT_ALERTS: dict[str, float] = {}
_DEDUPE_WINDOW_SECONDS = 120.0

DEFAULT_BOT_TOKEN = "9110747025:AAEIAxnCKolCfFosAGsLkoCAMWgGC026SdQ"


def _should_send_alert(dedupe_key: str, cooldown_seconds: float = _DEDUPE_WINDOW_SECONDS) -> bool:
    now = time.monotonic()
    with _DEDUPE_LOCK:
        expired = [k for k, ts in _RECENT_ALERTS.items() if now - ts > cooldown_seconds * 4]
        for k in expired:
            _RECENT_ALERTS.pop(k, None)
        last = _RECENT_ALERTS.get(dedupe_key)
        if last is not None and now - last < cooldown_seconds:
            return False
        _RECENT_ALERTS[dedupe_key] = now
        return True


def verify_app_credentials(db: Session, app_id: str, api_key: str) -> LogApp | None:
    """Validate app_id and api_key against registered log_apps."""
    app = db.scalar(select(LogApp).where(LogApp.id == app_id, LogApp.is_active.is_(True)))
    if not app:
        return None
    if app.api_key != api_key:
        return None
    return app


def get_rule_for_event(db: Session, app_id: str, category: str) -> LogRule | None:
    """Find specific category rule or fallback to wildcard rule for the app."""
    rule = db.scalar(
        select(LogRule).where(
            LogRule.app_id == app_id,
            LogRule.category == category,
        )
    )
    if not rule:
        rule = db.scalar(
            select(LogRule).where(
                LogRule.app_id == app_id,
                LogRule.category.is_(None),
            )
        )
    return rule


def _dispatch_telegram_alert(
    *,
    log_id: int,
    app_id: str,
    level: str,
    category: str,
    action: str,
    title: str,
    message: str | None,
    store_id: int | None,
    phone: str | None,
    ip: str | None,
    location: str | None,
    path: str | None,
    created_at_iso: str,
    thread_id: int | None = None,
) -> None:
    """Send formatted alert with inline buttons to Telegram."""
    if settings.ENVIRONMENT == "test":
        return

    icon = "🚨" if level in {"error", "critical"} else "⚠️" if level == "warn" else "ℹ️"
    lines = [
        f"{icon} {title}",
        f"📌 اپلیکیشن: <code>{app_id}</code> | دسته: <code>{category}</code>",
        f"⚡ اقدام: <code>{action}</code> | سطح: <b>{level.upper()}</b>",
    ]
    if path:
        lines.append(f"⚠️ مسیر: <code>{path}</code>")
    if message:
        clean_msg = message[:600] + ("..." if len(message) > 600 else "")
        lines.append(f"❌ شرح: <code>{clean_msg}</code>")
    if store_id or phone:
        store_txt = f"فروشگاه #{store_id}" if store_id else ""
        phone_txt = f"({phone})" if phone else ""
        lines.append(f"🏪 {store_txt} {phone_txt}".strip())
    if ip or location:
        geo = f"📍 {location}" if location else ""
        lines.append(f"🌍 آی‌پی: {ip or 'نامشخص'} {geo}".strip())
    lines.append(f"⏱️ ساعت: {created_at_iso}")

    body_text = "\n".join(lines)

    inline_keyboard = [
        [
            {"text": "✅ تأیید دیده‌شدن (Ack)", "callback_data": f"log_ack:{log_id}"},
            {"text": "🔕 بی‌صدا ۱ ساعته", "callback_data": f"log_mute:{app_id}:{category}"},
        ],
        [
            {"text": "🔍 پنل مدیریت لاگ‌ها", "url": "https://app.tanzimapp.ir/admin/logs"},
        ],
    ]

    # Attempt 1: Via telewhat relay
    if settings.TELEWHAT_ENABLED and settings.TELEWHAT_RELAY_URL:
        try:
            payload = json.dumps({
                "to": settings.TELEWHAT_TG_TARGET,
                "platform": "tg",
                "text": body_text,
                "reply_markup": {"inline_keyboard": inline_keyboard},
                "message_thread_id": thread_id,
            }).encode("utf-8")
            req = urllib.request.Request(
                settings.TELEWHAT_RELAY_URL,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                resp.read()
                return
        except Exception as exc:
            logger.debug("Telewhat relay failed: %s; trying direct telegram API", exc)

    # Attempt 2: Direct Telegram Bot API
    bot_token = settings.TELEGRAM_BOT_TOKEN or DEFAULT_BOT_TOKEN
    chat_id = settings.TELEGRAM_ADMIN_CHAT_ID or settings.TELEWHAT_TG_TARGET
    if bot_token and chat_id:
        try:
            tg_payload: dict[str, Any] = {
                "chat_id": chat_id,
                "text": body_text,
                "parse_mode": "HTML",
                "reply_markup": {"inline_keyboard": inline_keyboard},
            }
            if thread_id:
                tg_payload["message_thread_id"] = thread_id
            tg_req = urllib.request.Request(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                data=json.dumps(tg_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(tg_req, timeout=5) as resp:
                resp.read()
        except Exception as e:
            logger.warning("Direct telegram alert failed: %s", e)


def ingest_log_events(
    db: Session,
    *,
    app_id: str,
    events: list[dict[str, Any]],
    client_ip: str | None = None,
    client_ua: str | None = None,
) -> int:
    """Ingest a batch of standardized log events adhering to dynamic app rules."""
    accepted_count = 0
    now_utc = datetime.now(timezone.utc)

    for item in events[:50]:
        level = (item.get("level") or "info").lower().strip()
        if level not in LEVEL_ORDER:
            level = "info"

        category = (item.get("category") or "general").strip()[:64]
        action = (item.get("action") or "event").strip()[:64]
        title = (item.get("title") or action).strip()
        message = item.get("message")
        if message:
            message = str(message).strip()

        rule = get_rule_for_event(db, app_id, category)

        # Check mute window
        is_muted = False
        if rule and rule.mute_until and rule.mute_until > now_utc:
            is_muted = True

        # Check minimum level
        min_lvl = (rule.min_level if rule else "info").lower()
        if LEVEL_ORDER.get(level, 0) < LEVEL_ORDER.get(min_lvl, 0):
            continue

        metadata = item.get("metadata")
        context = item.get("context") or {}
        if isinstance(context, dict):
            if client_ip and "ip" not in context:
                context["ip"] = client_ip
            if client_ua and "ua" not in context:
                context["ua"] = client_ua

        store_id = item.get("storeId") or item.get("store_id")
        user_id = item.get("userId") or item.get("user_id")
        phone = item.get("phone")
        ip = context.get("ip") if isinstance(context, dict) else client_ip
        device = context.get("device") if isinstance(context, dict) else None
        location = context.get("location") if isinstance(context, dict) else None
        path = context.get("path") if isinstance(context, dict) else None

        save_to_db = rule.save_to_db if rule else True
        log_row: CentralLog | None = None

        if save_to_db:
            log_row = CentralLog(
                app_id=app_id,
                level=level,
                category=category,
                action=action,
                title=title[:255] if len(title) > 255 else title,
                message=message,
                store_id=int(store_id) if store_id is not None else None,
                user_id=int(user_id) if user_id is not None else None,
                phone=str(phone)[:32] if phone else None,
                metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
                context_json=json.dumps(context, ensure_ascii=False) if context else None,
                ip=str(ip)[:64] if ip else None,
                device=str(device)[:128] if device else None,
                location=str(location)[:128] if location else None,
                created_at=now_utc,
            )
            db.add(log_row)
            db.flush()

        accepted_count += 1

        # Evaluate Telegram alerting
        send_telegram = (rule.send_telegram if rule else True) and not is_muted
        if send_telegram and level in {"error", "critical", "audit"}:
            dedupe_raw = f"{app_id}:{category}:{action}:{path or ''}:{title[:60]}"
            dedupe_key = hashlib.sha256(dedupe_raw.encode("utf-8")).hexdigest()[:24]

            if _should_send_alert(dedupe_key):
                thread = threading.Thread(
                    target=_dispatch_telegram_alert,
                    kwargs={
                        "log_id": log_row.id if log_row else 0,
                        "app_id": app_id,
                        "level": level,
                        "category": category,
                        "action": action,
                        "title": title,
                        "message": message,
                        "store_id": int(store_id) if store_id else None,
                        "phone": str(phone) if phone else None,
                        "ip": str(ip) if ip else None,
                        "location": str(location) if location else None,
                        "path": str(path) if path else None,
                        "created_at_iso": now_utc.strftime("%Y-%m-%d %H:%M:%S UTC"),
                        "thread_id": rule.telegram_thread_id if rule else None,
                    },
                    daemon=True,
                )
                thread.start()

    db.commit()
    return accepted_count


def ack_log_record(db: Session, log_id: int, ack_by: str = "Admin") -> bool:
    """Acknowledge a log record from Telegram or Admin UI."""
    log = db.get(CentralLog, log_id)
    if not log:
        return False
    ctx = json.loads(log.context_json) if log.context_json else {}
    ctx["acknowledged"] = True
    ctx["acknowledged_by"] = ack_by
    ctx["acknowledged_at"] = datetime.now(timezone.utc).isoformat()
    log.context_json = json.dumps(ctx, ensure_ascii=False)
    db.commit()
    return True


def mute_app_category(db: Session, app_id: str, category: str, hours: int = 1) -> bool:
    """Mute alerts for a given app and category for N hours."""
    rule = db.scalar(select(LogRule).where(LogRule.app_id == app_id, LogRule.category == category))
    until = datetime.now(timezone.utc) + timedelta(hours=hours)
    if rule:
        rule.mute_until = until
        rule.updated_at = datetime.now(timezone.utc)
    else:
        rule = LogRule(
            app_id=app_id,
            category=category,
            mute_until=until,
            min_level="info",
            save_to_db=True,
            send_telegram=True,
        )
        db.add(rule)
    db.commit()
    return True
