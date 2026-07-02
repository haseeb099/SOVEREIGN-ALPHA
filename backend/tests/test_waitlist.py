"""Waitlist API tests."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
@pytest.mark.db_guard
async def test_waitlist_requires_db_when_skipped(client, monkeypatch):
    monkeypatch.setenv("SKIP_DB_INIT", "true")
    resp = await client.post(
        "/api/waitlist",
        json={"email": "test@example.com", "role": "analyst"},
    )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_waitlist_subscribe_new_email(client, monkeypatch):
    monkeypatch.setenv("SKIP_DB_INIT", "false")

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()

    class _Ctx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.waitlist.AsyncSessionLocal", lambda: _Ctx())
    with patch("routers.waitlist._send_confirmation", AsyncMock()):
        resp = await client.post(
            "/api/waitlist",
            json={"email": "new@example.com", "role": "pm"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "subscribed"


@pytest.mark.asyncio
async def test_waitlist_duplicate_email(client, monkeypatch):
    monkeypatch.setenv("SKIP_DB_INIT", "false")

    existing = MagicMock()
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_session.execute = AsyncMock(return_value=mock_result)

    class _Ctx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.waitlist.AsyncSessionLocal", lambda: _Ctx())
    resp = await client.post(
        "/api/waitlist",
        json={"email": "dup@example.com", "role": "analyst"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "already_subscribed"
