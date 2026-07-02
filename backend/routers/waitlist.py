"""Waitlist email capture for GTM launch."""
from __future__ import annotations

import logging
import os
import re
import uuid

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from models import WaitlistSubscriber
from services.db_guard import require_db

logger = logging.getLogger(__name__)
router = APIRouter()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM_EMAIL", "reports@yourdomain.com")


class WaitlistRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="analyst", pattern="^(analyst|pm|other)$")
    source: str = Field(default="landing", max_length=64)


async def _send_confirmation(email: str) -> None:
    if not RESEND_API_KEY:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={
                    "from": RESEND_FROM,
                    "to": [email],
                    "subject": "You're on the Sovereign-Alpha waitlist",
                    "html": (
                        "<p>Thanks for joining the Sovereign-Alpha waitlist.</p>"
                        "<p>We'll notify you when Pro access opens.</p>"
                    ),
                },
            )
    except Exception as exc:
        logger.warning("Waitlist confirmation email failed: %s", exc)


@router.post("/waitlist")
async def join_waitlist(body: WaitlistRequest):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    require_db()
    async with AsyncSessionLocal() as session:
        existing = (
            await session.execute(
                select(WaitlistSubscriber).where(WaitlistSubscriber.email == email)
            )
        ).scalar_one_or_none()
        if existing:
            return {"status": "already_subscribed", "email": email}

        row = WaitlistSubscriber(
            id=uuid.uuid4(),
            email=email,
            role=body.role,
            source=body.source,
            confirmed=False,
        )
        session.add(row)
        await session.commit()

    await _send_confirmation(email)
    return {"status": "subscribed", "email": email}
