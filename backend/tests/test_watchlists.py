"""Watchlist CRUD tests."""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_update_watchlist_tickers(client, monkeypatch):
    watchlist_id = str(uuid.uuid4())
    mock_row = MagicMock()
    mock_row.id = uuid.UUID(watchlist_id)
    mock_row.name = "Default"
    mock_row.tickers = ["TSLA", "AAPL"]
    mock_row.user_id = "dev-local-user"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=mock_row)

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.commit = AsyncMock()

    async def fake_refresh(row):
        row.tickers = ["NVDA", "TSLA"]

    mock_session.refresh = fake_refresh

    class FakeSessionCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.watchlists.AsyncSessionLocal", lambda: FakeSessionCtx())

    resp = await client.put(
        f"/api/watchlists/{watchlist_id}",
        json={"tickers": ["nvda", "tsla"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["tickers"] == ["NVDA", "TSLA"]
