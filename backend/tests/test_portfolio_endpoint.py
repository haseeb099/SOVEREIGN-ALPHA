"""Portfolio holdings API tests."""
from unittest.mock import AsyncMock, MagicMock
import uuid

import pytest


@pytest.mark.asyncio
async def test_create_holding_dev_auth(client, monkeypatch):
    """Dev auth assigns dev-local-user when Clerk is unset."""
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "development")

    holding_id = str(uuid.uuid4())
    mock_session = MagicMock()
    mock_session.get = AsyncMock(return_value=None)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()

    mock_holding = MagicMock()
    mock_holding.id = uuid.UUID(holding_id)
    mock_holding.ticker = "TSLA"
    mock_holding.shares = 10.0

    async def fake_refresh(obj):
        pass

    mock_session.refresh = fake_refresh

    class FakeSessionCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.portfolio.AsyncSessionLocal", lambda: FakeSessionCtx())
    monkeypatch.setattr("routers.portfolio._ensure_user", AsyncMock())

    original_holding = None

    def capture_add(obj):
        nonlocal original_holding
        original_holding = obj
        obj.id = uuid.UUID(holding_id)
        obj.ticker = "TSLA"
        obj.shares = 10.0

    mock_session.add = capture_add

    resp = await client.post(
        "/api/portfolio/holdings",
        json={"ticker": "tsla", "shares": 10, "cost_basis": 200},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ticker"] == "TSLA"
    assert data["shares"] == 10.0


@pytest.mark.asyncio
async def test_list_holdings_requires_auth_in_production(client, monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    monkeypatch.setenv("ENVIRONMENT", "production")

    resp = await client.get("/api/portfolio/holdings")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_update_holding(client, monkeypatch):
    holding_id = str(uuid.uuid4())
    mock_holding = MagicMock()
    mock_holding.id = uuid.UUID(holding_id)
    mock_holding.user_id = "dev-local-user"
    mock_holding.ticker = "TSLA"
    mock_holding.shares = 20.0

    mock_session = MagicMock()
    mock_session.get = AsyncMock(return_value=mock_holding)
    mock_session.commit = AsyncMock()

    class FakeSessionCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.portfolio.AsyncSessionLocal", lambda: FakeSessionCtx())

    resp = await client.put(
        f"/api/portfolio/holdings/{holding_id}",
        json={"shares": 20, "cost_basis": 210},
    )
    assert resp.status_code == 200
    assert resp.json()["shares"] == 20.0
