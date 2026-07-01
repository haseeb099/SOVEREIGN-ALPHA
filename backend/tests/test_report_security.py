"""Password-protected report share tests."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from routers.reports import _hash_password, _verify_password, _create_unlock_token, _verify_unlock_token


def test_password_hash_and_verify():
    hashed = _hash_password("secret123")
    assert _verify_password("secret123", hashed)
    assert not _verify_password("wrong", hashed)


def test_unlock_token_roundtrip():
    token = _create_unlock_token("report-id", "share-token")
    assert _verify_unlock_token(token, "share-token")
    assert not _verify_unlock_token(token, "other-token")


@pytest.mark.asyncio
async def test_get_report_401_without_password(client, monkeypatch):
    share_token = "protected-token"
    mock_row = MagicMock()
    mock_row.share_token = share_token
    mock_row.ticker = "TSLA"
    mock_row.payload = {"ticker": "TSLA", "memo": {"summary": "x", "rating": "BUY"}}
    mock_row.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    mock_row.password_hash = _hash_password("pass")
    mock_row.template = "equity_research"
    mock_row.version = 1
    mock_row.created_at = datetime.now(timezone.utc)
    mock_row.branding = None

    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=mock_row)
    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    class FakeCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr("routers.reports.AsyncSessionLocal", lambda: FakeCtx())

    resp = await client.get(f"/api/reports/{share_token}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unlock_with_valid_password(client, monkeypatch):
    share_token = "unlock-token"
    mock_row = MagicMock()
    mock_row.id = uuid.uuid4()
    mock_row.share_token = share_token
    mock_row.password_hash = _hash_password("mypass")
    mock_row.expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=mock_row)
    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    class FakeCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr("routers.reports.AsyncSessionLocal", lambda: FakeCtx())

    resp = await client.post(
        f"/api/reports/{share_token}/unlock",
        json={"password": "mypass"},
    )
    assert resp.status_code == 200
    assert resp.json()["unlocked"] is True


@pytest.mark.asyncio
async def test_expired_report_410(client, monkeypatch):
    mock_row = MagicMock()
    mock_row.share_token = "expired"
    mock_row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    mock_row.password_hash = None

    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=mock_row)
    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    class FakeCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr("routers.reports.AsyncSessionLocal", lambda: FakeCtx())

    resp = await client.get("/api/reports/expired")
    assert resp.status_code == 410
