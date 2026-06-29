"""Unit tests for market_service."""
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.market_service import ASSET_CONFIG, _fallback_data, get_market_data


@pytest.mark.asyncio
async def test_unknown_ticker_raises_value_error():
    with pytest.raises(ValueError, match="Unknown asset"):
        await get_market_data("INVALID")


@pytest.mark.asyncio
async def test_yfinance_response_schema(monkeypatch, sample_market_data):
    async def fake_yfinance(_ticker, config):
        return {**sample_market_data, "source": "yfinance"}

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.market_service._fetch_yfinance", fake_yfinance)

    data = await get_market_data("TSLA")

    assert set(data.keys()) >= {
        "price",
        "change_pct",
        "volatility_30d",
        "source",
        "full_name",
        "asset_class",
    }
    assert data["price"] == 185.20
    assert data["source"] == "yfinance"


@pytest.mark.asyncio
async def test_fallback_on_fetch_failure(monkeypatch):
    async def failing_fetch(_ticker, _config):
        raise RuntimeError("yfinance unavailable")

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.market_service._fetch_yfinance", failing_fetch)

    data = await get_market_data("TSLA")

    assert data["source"] == "fallback"
    assert data["price"] == 185.20
    assert "error" in data


def test_fallback_data_matches_prototype():
    config = ASSET_CONFIG["BTC"]
    data = _fallback_data("BTC", config, "test error")

    assert data["price"] == 94250.00
    assert data["change_pct"] == 5.8
    assert data["volatility_30d"] == 54.2
    assert data["source"] == "fallback"


@pytest.mark.asyncio
async def test_unknown_ticker_via_router_returns_404(client):
    resp = await client.get("/api/market/INVALID")
    assert resp.status_code == 404
