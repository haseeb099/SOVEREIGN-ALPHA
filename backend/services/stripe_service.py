"""Stripe integration helpers."""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE_ID = os.environ.get("STRIPE_PRO_PRICE_ID", "price_pro_monthly_99")


def stripe_configured() -> bool:
    return bool(STRIPE_SECRET_KEY)


def _get_stripe():
    if not STRIPE_SECRET_KEY:
        raise RuntimeError("STRIPE_SECRET_KEY not set")
    import stripe

    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


async def create_checkout_session(
    user_id: str,
    customer_id: str | None,
    email: str | None,
    success_url: str,
    cancel_url: str,
) -> dict:
    stripe = _get_stripe()
    params: dict = {
        "mode": "subscription",
        "line_items": [{"price": STRIPE_PRO_PRICE_ID, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"user_id": user_id},
        "subscription_data": {
            "metadata": {"user_id": user_id},
            "trial_period_days": 14,
        },
    }
    if customer_id:
        params["customer"] = customer_id
    elif email:
        params["customer_email"] = email

    session = stripe.checkout.Session.create(**params)
    return {
        "url": session.url,
        "session_id": session.id,
        "customer_id": session.customer,
    }


async def create_portal_session(customer_id: str, return_url: str) -> str:
    stripe = _get_stripe()
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


def handle_webhook_event(payload: bytes, signature: str) -> dict | None:
    if not STRIPE_WEBHOOK_SECRET:
        if os.environ.get("ENVIRONMENT", "development") != "production":
            import json

            try:
                return json.loads(payload)
            except Exception:
                return None
        return None
    stripe = _get_stripe()
    try:
        return stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
    except Exception as exc:
        logger.warning("Stripe webhook verification failed: %s", exc)
        return None
