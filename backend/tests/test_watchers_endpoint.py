"""Watchers API endpoint tests."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_watcher_status_endpoint(client, monkeypatch):
    monkeypatch.setattr(
        "routers.watchers.watcher_service.get_status",
        lambda: {
            "enabled": True,
            "last_poll_at": None,
            "poll_interval_seconds": 300,
            "tickers_monitored": ["TSLA"],
        },
    )
    monkeypatch.setattr(
        "routers.watchers.AsyncSessionLocal",
        None,
    )
    resp = await client.get("/api/watchers/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True


@pytest.mark.asyncio
async def test_poll_now_endpoint(client, monkeypatch):
    monkeypatch.setattr(
        "routers.watchers.watcher_service.poll_once",
        AsyncMock(return_value={"enabled": True, "events": []}),
    )
    resp = await client.post("/api/watchers/poll-now")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True
