"""Filing watcher API — subscribe, status, manual poll."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from middleware.auth import require_auth
from models import FilingEvent, FilingWatchSubscription
from services import watcher_service

router = APIRouter()


class WatchSubscribeRequest(BaseModel):
    ticker: str
    forms: list[str] = Field(default_factory=lambda: ["10-Q", "8-K", "10-K", "4"])


def _require_user(request: Request) -> str:
    return require_auth(request)


@router.get("/watchers/status")
async def watcher_status(request: Request):
    user_id = None
    try:
        user_id = _require_user(request)
    except Exception:
        pass

    status = watcher_service.get_status()
    subscriptions = []
    recent_events = []

    try:
        async with AsyncSessionLocal() as session:
            if user_id:
                subs = (
                    await session.execute(
                        select(FilingWatchSubscription).where(
                            FilingWatchSubscription.user_id == user_id
                        )
                    )
                ).scalars().all()
                subscriptions = [
                    {
                        "id": str(s.id),
                        "ticker": s.ticker,
                        "forms": s.forms or [],
                        "enabled": s.enabled,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                    }
                    for s in subs
                ]

            events = (
                await session.execute(
                    select(FilingEvent).order_by(FilingEvent.ingested_at.desc()).limit(20)
                )
            ).scalars().all()
            recent_events = [
                {
                    "id": str(e.id),
                    "ticker": e.ticker,
                    "form": e.form,
                    "accession": e.accession,
                    "filed_at": e.filed_at.isoformat() if e.filed_at else None,
                    "ingested_at": e.ingested_at.isoformat() if e.ingested_at else None,
                    "analysis_triggered": e.analysis_triggered,
                }
                for e in events
            ]
    except Exception:
        pass

    return {**status, "subscriptions": subscriptions, "recent_events": recent_events}


@router.post("/watchers/subscribe")
async def subscribe(request: Request, body: WatchSubscribeRequest):
    user_id = _require_user(request)
    ticker = body.ticker.upper()
    async with AsyncSessionLocal() as session:
        row = FilingWatchSubscription(
            user_id=user_id,
            ticker=ticker,
            forms=body.forms,
            enabled=True,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return {
            "id": str(row.id),
            "ticker": row.ticker,
            "forms": row.forms,
            "enabled": row.enabled,
        }


@router.delete("/watchers/subscribe/{subscription_id}")
async def unsubscribe(request: Request, subscription_id: str):
    user_id = _require_user(request)
    async with AsyncSessionLocal() as session:
        row = await session.get(FilingWatchSubscription, uuid.UUID(subscription_id))
        if not row or row.user_id != user_id:
            raise HTTPException(status_code=404, detail="Subscription not found")
        await session.delete(row)
        await session.commit()
        return {"deleted": subscription_id}


@router.post("/watchers/poll-now")
async def poll_now(request: Request):
    """Manual poll trigger (dev/admin)."""
    try:
        _require_user(request)
    except Exception:
        pass
    result = await watcher_service.poll_once()
    return result
