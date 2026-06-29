"""Integration tests for Polygon fallback chain."""
from unittest.mock import AsyncMock

import pytest

from services.market_service import get_market_data


@pytest.mark.asyncio
async def test_polygon_primary_when_configured(monkeypatch):
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()

    async def fake_polygon_snapshot(ticker):
        return {
            "asset_key": ticker,
            "full_name": ticker,
            "asset_class": "Equity",
            "icon": "trending_up",
            "price": 250.0,
            "change_pct": 2.04,
            "is_positive": True,
            "volatility_30d": 35.0,
            "source": "polygon",
            "fetched_at": 1710000000.0,
        }

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.market_service.get_snapshot", fake_polygon_snapshot)

    data = await get_market_data("AAPL")

    assert data["source"] == "polygon"
    assert data["price"] == 250.0


@pytest.mark.asyncio
async def test_falls_back_to_yfinance_when_polygon_fails(monkeypatch, sample_market_data):
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()

    async def fake_yfinance(_ticker, config):
        return {**sample_market_data, "source": "yfinance"}

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.polygon_service.get_snapshot", AsyncMock(return_value=None))
    monkeypatch.setattr("services.market_service._fetch_yfinance", fake_yfinance)

    data = await get_market_data("TSLA")

    assert data["source"] == "yfinance"


@pytest.mark.asyncio
async def test_market_search_endpoint(client, monkeypatch):
    monkeypatch.setattr(
        "routers.market.search_market",
        AsyncMock(return_value=[{"ticker": "RIVN", "name": "Rivian Automotive", "market": "stocks"}]),
    )
    resp = await client.get("/api/market/search?q=rivn")
    assert resp.status_code == 200
    assert resp.json()["results"][0]["ticker"] == "RIVN"
