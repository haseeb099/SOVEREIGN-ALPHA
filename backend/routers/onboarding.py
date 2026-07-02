"""Onboarding funnel analytics."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from database import AsyncSessionLocal
from middleware.auth import require_auth
from models import OnboardingEvent, User
from services.db_guard import require_db

router = APIRouter()


class OnboardingCompleteRequest(BaseModel):
    ticker: str = Field(default="TSLA", max_length=16)
    steps_completed: int = Field(default=4, ge=1, le=10)


@router.post("/onboarding/complete")
async def onboarding_complete(request: Request, body: OnboardingCompleteRequest):
    user_id = getattr(request.state, "user_id", None)

    require_db()
    async with AsyncSessionLocal() as session:
        session.add(
            OnboardingEvent(
                id=uuid.uuid4(),
                user_id=user_id,
                event_type="onboarding_complete",
                payload={"ticker": body.ticker, "steps": body.steps_completed},
            )
        )
        if user_id:
            user = await session.get(User, user_id)
            if user:
                user.onboarding_completed_at = datetime.now(timezone.utc)
            else:
                session.add(
                    User(
                        id=user_id,
                        onboarding_completed_at=datetime.now(timezone.utc),
                    )
                )
        await session.commit()

    return {"status": "recorded"}


@router.post("/onboarding/event")
async def onboarding_event(request: Request, event_type: str, payload: dict | None = None):
    user_id = getattr(request.state, "user_id", None)
    require_db()
    async with AsyncSessionLocal() as session:
        session.add(
            OnboardingEvent(
                id=uuid.uuid4(),
                user_id=user_id,
                event_type=event_type[:64],
                payload=payload,
            )
        )
        await session.commit()
    return {"status": "recorded"}
