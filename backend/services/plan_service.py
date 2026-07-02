"""Plan tier helpers — Personal (free), Pro, Enterprise."""
from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy import select

from database import AsyncSessionLocal
from models import User
from services.db_guard import require_db

PRO_TIERS = frozenset({"pro", "enterprise"})


def normalize_plan_tier(tier: str | None) -> str:
    raw = (tier or "free").lower()
    if raw in ("starter", "personal"):
        return "free"
    return raw


async def get_user_plan_tier(user_id: str | None) -> str:
    if not user_id:
        return "free"
    require_db()
    try:
        async with AsyncSessionLocal() as session:
            user = await session.get(User, user_id)
            if user:
                return normalize_plan_tier(user.plan_tier)
    except Exception:
        pass
    return "free"


async def require_pro_plan(request: Request) -> str:
    """Require authenticated user with Pro or Enterprise plan."""
    from middleware.auth import require_auth

    user_id = require_auth(request)
    tier = await get_user_plan_tier(user_id)
    if tier not in PRO_TIERS:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "plan_required",
                "message": "Pro or Enterprise plan required for this feature",
                "plan_tier": tier,
                "upgrade_url": "/pricing",
            },
        )
    return user_id


async def get_billing_status(user_id: str) -> dict:
    """Return billing fields for the authenticated user."""
    require_db()
    try:
        async with AsyncSessionLocal() as session:
            user = await session.get(User, user_id)
            if not user:
                return {
                    "plan_tier": "free",
                    "stripe_customer_id": None,
                    "stripe_subscription_id": None,
                    "beta_invite_code": None,
                    "onboarding_completed_at": None,
                }
            return {
                "plan_tier": normalize_plan_tier(user.plan_tier),
                "stripe_customer_id": user.stripe_customer_id,
                "stripe_subscription_id": user.stripe_subscription_id,
                "beta_invite_code": user.beta_invite_code,
                "beta_expires_at": user.beta_expires_at.isoformat() if user.beta_expires_at else None,
                "onboarding_completed_at": (
                    user.onboarding_completed_at.isoformat() if user.onboarding_completed_at else None
                ),
            }
    except Exception:
        return {"plan_tier": "free", "stripe_customer_id": None, "stripe_subscription_id": None}


def is_pro_tier(tier: str | None) -> bool:
    return normalize_plan_tier(tier) in PRO_TIERS
