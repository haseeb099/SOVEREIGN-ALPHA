"""Stripe billing — checkout, webhooks, customer portal."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from database import AsyncSessionLocal
from middleware.auth import require_auth
from models import ApiKey, User
from services.plan_service import get_billing_status
from services.db_guard import require_db
from services.stripe_service import (
    create_checkout_session,
    create_portal_session,
    handle_webhook_event,
    stripe_configured,
)

logger = logging.getLogger(__name__)
router = APIRouter()

APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")


class CheckoutRequest(BaseModel):
    success_url: str | None = None
    cancel_url: str | None = None


@router.get("/billing/status")
async def billing_status(request: Request):
    user_id = require_auth(request)
    return await get_billing_status(user_id)


@router.post("/billing/checkout")
async def billing_checkout(request: Request, body: CheckoutRequest | None = None):
    user_id = require_auth(request)
    if not stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    require_db()
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
        if not user:
            user = User(id=user_id)
            session.add(user)
            await session.flush()

        success_url = (body.success_url if body else None) or f"{APP_URL}/pricing/success"
        cancel_url = (body.cancel_url if body else None) or f"{APP_URL}/pricing/cancel"
        session_data = await create_checkout_session(
            user_id=user_id,
            customer_id=user.stripe_customer_id,
            email=user.email,
            success_url=success_url,
            cancel_url=cancel_url,
        )
        if session_data.get("customer_id") and not user.stripe_customer_id:
            user.stripe_customer_id = session_data["customer_id"]
            await session.commit()

    return {"checkout_url": session_data["url"], "session_id": session_data["session_id"]}


@router.post("/billing/portal")
async def billing_portal(request: Request):
    user_id = require_auth(request)
    if not stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    require_db()
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
        if not user or not user.stripe_customer_id:
            raise HTTPException(status_code=400, detail="No Stripe customer on file")
        url = await create_portal_session(user.stripe_customer_id, f"{APP_URL}/settings")
    return {"portal_url": url}


@router.post("/billing/webhook")
async def billing_webhook(request: Request):
    if not stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    event = handle_webhook_event(payload, sig)
    if not event:
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        user_id = data.get("metadata", {}).get("user_id")
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")
        if user_id:
            await _upgrade_user(user_id, customer_id, subscription_id)

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        user_id = data.get("metadata", {}).get("user_id")
        status = data.get("status", "")
        customer_id = data.get("customer")
        subscription_id = data.get("id")
        if user_id and status in ("active", "trialing"):
            await _upgrade_user(user_id, customer_id, subscription_id)
        elif user_id and status in ("canceled", "unpaid", "past_due"):
            await _downgrade_user(user_id)

    elif event_type == "customer.subscription.deleted":
        user_id = data.get("metadata", {}).get("user_id")
        if user_id:
            await _downgrade_user(user_id)

    return {"received": True}


async def _upgrade_user(user_id: str, customer_id: str | None, subscription_id: str | None) -> None:
    require_db()
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
        if not user:
            user = User(id=user_id, plan_tier="pro")
            session.add(user)
        else:
            user.plan_tier = "pro"
        if customer_id:
            user.stripe_customer_id = customer_id
        if subscription_id:
            user.stripe_subscription_id = subscription_id
        await session.flush()
        keys = (
            await session.execute(select(ApiKey).where(ApiKey.user_id == user_id))
        ).scalars().all()
        for key in keys:
            key.plan_tier = "pro"
        await session.commit()


async def _downgrade_user(user_id: str) -> None:
    require_db()
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
        if not user:
            return
        if user.plan_tier == "enterprise":
            return
        user.plan_tier = "free"
        user.stripe_subscription_id = None
        keys = (
            await session.execute(select(ApiKey).where(ApiKey.user_id == user_id))
        ).scalars().all()
        for key in keys:
            if key.plan_tier != "enterprise":
                key.plan_tier = "free"
        await session.commit()
