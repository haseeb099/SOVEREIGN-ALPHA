"""Unit tests for market_service."""
from unittest.mock import AsyncMock

import pytest

from services.market_service import ASSET_CONFIG, _fallback_data, get_market_data


@pytest.mark.asyncio
async def test_unknown_ticker_uses_fallback(monkeypatch):
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()

    async def failing_fetch(_ticker, _config):
        raise RuntimeError("yfinance unavailable")

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.polygon_service.polygon_available", AsyncMock(return_value=False))
    monkeypatch.setattr("services.polygon_service.get_snapshot", AsyncMock(return_value=None))
    monkeypatch.setattr("services.market_service._fetch_yfinance", failing_fetch)
    monkeypatch.setattr(
        "services.market_service._fetch_alpha_vantage",
        AsyncMock(side_effect=RuntimeError("alpha vantage unavailable")),
    )

    data = await get_market_data("RIVN")

    assert data["source"] == "fallback"
    assert data["asset_key"] == "RIVN"
    assert "price" in data


@pytest.mark.asyncio
async def test_unknown_ticker_via_router_returns_data(client, monkeypatch):
    async def fake_market(ticker):
        return {
            "asset_key": ticker,
            "price": 100,
            "change_pct": 1.0,
            "volatility_30d": 20,
            "full_name": ticker,
            "asset_class": "Equity",
            "icon": "show_chart",
            "is_positive": True,
            "source": "fallback",
            "fetched_at": 0,
        }

    monkeypatch.setattr("routers.market.get_market_data", fake_market)
    resp = await client.get("/api/market/RIVN")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_yfinance_response_schema(monkeypatch, sample_market_data):
    async def fake_yfinance(_ticker, config):
        return {**sample_market_data, "source": "yfinance"}

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.polygon_service.polygon_available", AsyncMock(return_value=False))
    monkeypatch.setattr("services.polygon_service.get_snapshot", AsyncMock(return_value=None))
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
    monkeypatch.setattr("services.polygon_service.polygon_available", AsyncMock(return_value=False))
    monkeypatch.setattr("services.polygon_service.get_snapshot", AsyncMock(return_value=None))
    monkeypatch.setattr("services.market_service._fetch_yfinance", failing_fetch)
    monkeypatch.setattr(
        "services.market_service._fetch_alpha_vantage",
        AsyncMock(side_effect=RuntimeError("alpha vantage unavailable")),
    )

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
