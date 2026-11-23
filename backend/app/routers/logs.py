from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select

from ..deps import CurrentAdmin, DbSession
from ..models import AppLog, CentralLog, LogApp, LogRule
from ..services.central_logger_service import (
    ack_log_record,
    ingest_log_events,
    mute_app_category,
    verify_app_credentials,
)
from ..services.logging_service import record_app_log

router = APIRouter(tags=["logs"])


# ---------- Legacy Client Ingest ----------
class ClientLogItem(BaseModel):
    level: str = Field(default="error", max_length=20)
    source: str = Field(default="frontend", max_length=32)
    event: str = Field(default="client.error", max_length=80)
    message: str = Field(min_length=1, max_length=2000)
    request_id: str | None = Field(default=None, max_length=64)
    path: str | None = Field(default=None, max_length=255)
    status_code: int | None = None
    details: dict[str, Any] | None = None


class ClientLogBatchIn(BaseModel):
    items: list[ClientLogItem] = Field(min_length=1, max_length=20)


@router.post("/logs/client", status_code=202)
def ingest_client_logs(
    payload: ClientLogBatchIn,
    request: Request,
    db: DbSession,
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    recorded = 0
    for item in payload.items[:20]:
        lvl = item.level.lower()
        notify = lvl in {"error", "critical"}
        record_app_log(
            db,
            level=lvl,
            source=item.source or "frontend",
            event=item.event,
            message=item.message,
            request_id=item.request_id,
            path=item.path,
            status_code=item.status_code,
            details=item.details,
            ip_address=ip,
            user_agent=ua,
            notify_telegram=notify,
        )
        recorded += 1
    return {"accepted": recorded}


# ---------- Multi-Tenant Central Log Ingest ----------
class StandardLogEventIn(BaseModel):
    level: str = Field(default="info", max_length=16)
    category: str = Field(min_length=1, max_length=64)
    action: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    message: str | None = None
    storeId: int | None = None
    userId: int | None = None
    phone: str | None = None
    metadata: dict[str, Any] | None = None
    context: dict[str, Any] | None = None


class CentralLogBatchIn(BaseModel):
    events: list[StandardLogEventIn] = Field(min_length=1, max_length=50)


@router.post("/logs/ingest", status_code=202)
@router.post("/v1/logs/ingest", status_code=202)
def ingest_central_logs(
    payload: CentralLogBatchIn | StandardLogEventIn,
    request: Request,
    db: DbSession,
    x_app_id: str | None = Header(default=None, alias="X-App-Id"),
    x_app_token: str | None = Header(default=None, alias="X-App-Token"),
    authorization: str | None = Header(default=None),
):
    app_id = x_app_id
    api_key = x_app_token
    if not api_key and authorization and authorization.startswith("Bearer "):
        api_key = authorization.split("Bearer ", 1)[1].strip()

    if not app_id or not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-App-Id header or Bearer / X-App-Token authorization token",
        )

    app = verify_app_credentials(db, app_id, api_key)
    if not app:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid app_id or api_key credentials",
        )

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    raw_items = [payload] if isinstance(payload, StandardLogEventIn) else payload.events
    raw_events = [ev.model_dump() for ev in raw_items]
    accepted = ingest_log_events(db, app_id=app_id, events=raw_events, client_ip=ip, client_ua=ua)

    return {"status": "ok", "appId": app_id, "accepted": accepted}


# ---------- Admin Logs & Dynamic Rules Control Plane ----------
@router.get("/admin/logs/central")
def list_central_logs(
    _: CurrentAdmin,
    db: DbSession,
    app_id: str | None = Query(default=None),
    level: str | None = Query(default=None),
    category: str | None = Query(default=None),
    store_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    stmt = select(CentralLog).order_by(desc(CentralLog.id)).limit(limit)
    if app_id:
        stmt = stmt.where(CentralLog.app_id == app_id.strip())
    if level:
        stmt = stmt.where(CentralLog.level == level.strip().lower())
    if category:
        stmt = stmt.where(CentralLog.category == category.strip())
    if store_id:
        stmt = stmt.where(CentralLog.store_id == store_id)

    rows = list(db.scalars(stmt))
    return [
        {
            "id": r.id,
            "appId": r.app_id,
            "level": r.level,
            "category": r.category,
            "action": r.action,
            "title": r.title,
            "message": r.message,
            "storeId": r.store_id,
            "userId": r.user_id,
            "phone": r.phone,
            "metadata": json.loads(r.metadata_json) if r.metadata_json else None,
            "context": json.loads(r.context_json) if r.context_json else None,
            "ip": r.ip,
            "device": r.device,
            "location": r.location,
            "createdAt": r.created_at,
        }
        for r in rows
    ]


class LogRuleUpdateIn(BaseModel):
    appId: str
    category: str | None = None
    minLevel: str = "info"
    saveToDb: bool = True
    sendTelegram: bool = True
    telegramThreadId: int | None = None
    muteHours: int | None = None


@router.get("/admin/logs/rules")
def get_log_rules(
    _: CurrentAdmin,
    db: DbSession,
    app_id: str | None = Query(default=None),
):
    stmt = select(LogRule)
    if app_id:
        stmt = stmt.where(LogRule.app_id == app_id)
    rules = list(db.scalars(stmt))
    return [
        {
            "id": r.id,
            "appId": r.app_id,
            "category": r.category,
            "minLevel": r.min_level,
            "saveToDb": r.save_to_db,
            "sendTelegram": r.send_telegram,
            "telegramThreadId": r.telegram_thread_id,
            "muteUntil": r.mute_until,
            "updatedAt": r.updated_at,
        }
        for r in rules
    ]


@router.put("/admin/logs/rules")
def update_log_rule(
    payload: LogRuleUpdateIn,
    _: CurrentAdmin,
    db: DbSession,
):
    rule = db.scalar(
        select(LogRule).where(
            LogRule.app_id == payload.appId,
            LogRule.category == payload.category,
        )
    )
    if not rule:
        rule = LogRule(
            app_id=payload.appId,
            category=payload.category,
        )
        db.add(rule)

    rule.min_level = payload.minLevel.lower()
    rule.save_to_db = payload.saveToDb
    rule.send_telegram = payload.sendTelegram
    rule.telegram_thread_id = payload.telegramThreadId
    if payload.muteHours and payload.muteHours > 0:
        mute_app_category(db, payload.appId, payload.category or "all", payload.muteHours)

    db.commit()
    return {"status": "ok", "ruleId": rule.id}


class LogActionAckIn(BaseModel):
    logId: int
    ackBy: str = "Admin"


class LogActionMuteIn(BaseModel):
    appId: str
    category: str
    hours: int = 1


@router.post("/logs/ack")
@router.post("/v1/logs/ack")
def acknowledge_log(
    payload: LogActionAckIn,
    db: DbSession,
):
    success = ack_log_record(db, payload.logId, ack_by=payload.ackBy)
    if not success:
        raise HTTPException(status_code=404, detail="Log record not found")
    return {"status": "ok", "logId": payload.logId, "acknowledged": True}


@router.post("/logs/mute")
@router.post("/v1/logs/mute")
def mute_log_category(
    payload: LogActionMuteIn,
    db: DbSession,
):
    mute_app_category(db, payload.appId, payload.category, hours=payload.hours)
    return {"status": "ok", "appId": payload.appId, "category": payload.category, "mutedHours": payload.hours}


# ---------- Legacy Admin Logs Route ----------
@router.get("/admin/logs")
def list_admin_logs(
    _: CurrentAdmin,
    db: DbSession,
    level: str | None = Query(default=None),
    source: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    stmt = select(AppLog).order_by(desc(AppLog.id)).limit(limit)
    if level:
        stmt = stmt.where(AppLog.level == level.strip().lower())
    if source:
        stmt = stmt.where(AppLog.source == source.strip().lower())
    rows = list(db.scalars(stmt))
    return [
        {
            "id": r.id,
            "created_at": r.created_at,
            "level": r.level,
            "source": r.source,
            "event": r.event,
            "user_id": r.user_id,
            "store_id": r.store_id,
            "request_id": r.request_id,
            "path": r.path,
            "status_code": r.status_code,
            "message": r.message,
            "details": json.loads(r.details_json) if r.details_json else None,
            "ip_address": r.ip_address,
        }
        for r in rows
    ]
