"""Stripe billing webhook tests."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_billing_webhook_checkout_completed(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_mock")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr("routers.billing.stripe_configured", lambda: True)

    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {"user_id": "user_stripe_1"},
                "customer": "cus_123",
                "subscription": "sub_456",
            }
        },
    }

    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.plan_tier = "free"
    mock_user.stripe_customer_id = None
    mock_user.stripe_subscription_id = None
    mock_session.get = AsyncMock(return_value=mock_user)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_keys_result = MagicMock()
    mock_keys_result.scalars.return_value.all.return_value = []
    mock_session.execute = AsyncMock(return_value=mock_keys_result)

    class _Ctx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.billing.AsyncSessionLocal", lambda: _Ctx())

    monkeypatch.setattr("routers.billing.require_db", lambda: None)

    with patch(
        "routers.billing.handle_webhook_event",
        return_value=event,
    ):
        resp = await client.post(
            "/api/billing/webhook",
            content=json.dumps(event),
            headers={"stripe-signature": "test"},
        )
    assert resp.status_code == 200
    assert resp.json()["received"] is True


@pytest.mark.asyncio
async def test_billing_status_requires_auth(client, monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    monkeypatch.setenv("ENVIRONMENT", "production")
    resp = await client.get("/api/billing/status")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_billing_checkout_not_configured(client, monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    from starlette.requests import Request

    scope = {"type": "http", "method": "POST", "path": "/", "headers": []}
    request = Request(scope)
    request.state.user_id = "user_1"

    from routers.billing import billing_checkout

    with pytest.raises(Exception) as exc:
        await billing_checkout(request, None)
    assert getattr(exc.value, "status_code", None) == 503
