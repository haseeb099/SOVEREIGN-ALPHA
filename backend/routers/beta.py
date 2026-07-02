"""Beta programme — applications, invite codes, verification."""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from middleware.auth import require_auth
from middleware.rbac import role_has_permission
from models import BetaApplication, User
from services.db_guard import require_db

logger = logging.getLogger(__name__)
router = APIRouter()

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM_EMAIL", "reports@yourdomain.com")
APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
BETA_TRIAL_DAYS = 90


class BetaApplyRequest(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=256)
    firm: str = Field(..., min_length=1, max_length=256)
    role: str = Field(default="analyst", max_length=128)
    use_case: str = Field(..., min_length=10, max_length=2000)


class BetaVerifyRequest(BaseModel):
    invite_code: str = Field(..., min_length=8, max_length=64)


def _generate_invite_code() -> str:
    return f"SA-{secrets.token_hex(4).upper()}"


async def _send_beta_invite(email: str, invite_code: str) -> None:
    if not RESEND_API_KEY:
        return
    link = f"{APP_URL}/beta?code={invite_code}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={
                    "from": RESEND_FROM,
                    "to": [email],
                    "subject": "Your Sovereign-Alpha beta invite",
                    "html": (
                        f"<p>You've been approved for the Sovereign-Alpha beta programme.</p>"
                        f"<p>Your invite code: <strong>{invite_code}</strong></p>"
                        f"<p><a href=\"{link}\">Activate Pro access</a></p>"
                    ),
                },
            )
    except Exception as exc:
        logger.warning("Beta invite email failed: %s", exc)


@router.post("/beta/apply")
async def beta_apply(body: BetaApplyRequest):
    email = body.email.strip().lower()
    require_db()
    async with AsyncSessionLocal() as session:
        existing = (
            await session.execute(
                select(BetaApplication).where(BetaApplication.email == email)
            )
        ).scalar_one_or_none()
        if existing:
            return {"status": "already_applied", "application_id": str(existing.id)}

        row = BetaApplication(
            id=uuid.uuid4(),
            email=email,
            name=body.name,
            firm=body.firm,
            role=body.role,
            use_case=body.use_case,
            status="pending",
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return {"status": "submitted", "application_id": str(row.id)}


@router.post("/beta/verify")
async def beta_verify(request: Request, body: BetaVerifyRequest):
    user_id = require_auth(request)
    code = body.invite_code.strip().upper()

    require_db()
    async with AsyncSessionLocal() as session:
        app_row = (
            await session.execute(
                select(BetaApplication).where(
                    BetaApplication.invite_code == code,
                    BetaApplication.status == "approved",
                )
            )
        ).scalar_one_or_none()
        if not app_row:
            raise HTTPException(status_code=400, detail="Invalid or expired invite code")

        user = await session.get(User, user_id)
        if not user:
            user = User(id=user_id, plan_tier="pro")
            session.add(user)
        else:
            user.plan_tier = "pro"
        user.beta_invite_code = code
        user.beta_expires_at = datetime.now(timezone.utc) + timedelta(days=BETA_TRIAL_DAYS)
        await session.commit()

    return {
        "status": "activated",
        "plan_tier": "pro",
        "expires_at": user.beta_expires_at.isoformat(),
    }


@router.get("/beta/applications")
async def list_beta_applications(request: Request):
    user_id = require_auth(request)
    role = getattr(request.state, "org_role", None)
    if not role_has_permission(role, "audit:read"):
        raise HTTPException(status_code=403, detail="Admin permission required")

    require_db()
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(BetaApplication).order_by(BetaApplication.created_at.desc())
            )
        ).scalars().all()
    return {
        "applications": [
            {
                "id": str(r.id),
                "email": r.email,
                "name": r.name,
                "firm": r.firm,
                "role": r.role,
                "status": r.status,
                "invite_code": r.invite_code,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.post("/beta/applications/{application_id}/approve")
async def approve_beta_application(application_id: str, request: Request):
    require_auth(request)
    role = getattr(request.state, "org_role", None)
    if not role_has_permission(role, "members:write"):
        raise HTTPException(status_code=403, detail="Admin permission required")

    try:
        aid = uuid.UUID(application_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid application id")

    require_db()
    async with AsyncSessionLocal() as session:
        app_row = await session.get(BetaApplication, aid)
        if not app_row:
            raise HTTPException(status_code=404, detail="Application not found")
        if not app_row.invite_code:
            app_row.invite_code = _generate_invite_code()
        app_row.status = "approved"
        await session.commit()
        code = app_row.invite_code
        email = app_row.email

    await _send_beta_invite(email, code)
    return {"status": "approved", "invite_code": code}
