from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import desc, select

from ..deps import CurrentAdmin, DbSession
from ..models import AppLog
from ..services.logging_service import record_app_log

router = APIRouter(tags=["logs"])


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
    user_id = None
    store_id = None

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
            user_id=user_id,
            store_id=store_id,
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
