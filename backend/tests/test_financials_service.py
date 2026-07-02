"""Unit tests for financials_service."""
from unittest.mock import AsyncMock, patch

import pytest

from services.financials_service import _normalize_snapshot, fetch_financial_snapshot


def test_normalize_snapshot_computes_market_cap():
    raw = {
        "shares_outstanding": 1000,
        "current_price": 50,
        "revenue": 1_000_000,
        "source": "test",
    }
    snap = _normalize_snapshot("TSLA", raw)
    assert snap["market_cap"] == 50_000
    assert snap["ticker"] == "TSLA"
    assert snap["insufficient_data"] is False


def test_normalize_snapshot_insufficient_data():
    snap = _normalize_snapshot("SPY", {"source": "yfinance", "insufficient_data": True})
    assert snap["insufficient_data"] is True


@pytest.mark.asyncio
async def test_fetch_financial_snapshot_uses_cache(monkeypatch):
    cached = {"ticker": "AAPL", "revenue": 100, "source": "cache"}
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value='{"ticker": "AAPL", "revenue": 100, "source": "cache"}')
    monkeypatch.setattr("services.financials_service.get_redis", AsyncMock(return_value=mock_redis))

    result = await fetch_financial_snapshot("AAPL")
    assert result["ticker"] == "AAPL"
    mock_redis.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_financial_snapshot_yfinance_fallback(monkeypatch):
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()
    monkeypatch.setattr("services.financials_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.financials_service._fetch_polygon_financials", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "services.financials_service._fetch_yfinance_financials",
        AsyncMock(return_value={
            "revenue": 500_000_000,
            "fcf": 50_000_000,
            "shares_outstanding": 1_000_000,
            "current_price": 100,
            "source": "yfinance",
        }),
    )

    result = await fetch_financial_snapshot("TEST")
    assert result["revenue"] == 500_000_000
    assert result["source"] == "yfinance"
    mock_redis.setex.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_financial_snapshot_yfinance_error_returns_insufficient(monkeypatch):
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()
    monkeypatch.setattr("services.financials_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.financials_service._fetch_polygon_financials", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "services.financials_service._fetch_yfinance_financials",
        AsyncMock(return_value={
            "insufficient_data": True,
            "message": "Financial data temporarily unavailable",
            "source": "yfinance",
        }),
    )

    result = await fetch_financial_snapshot("TSLA")
    assert result["insufficient_data"] is True
    assert "temporarily unavailable" in (result.get("message") or "")
