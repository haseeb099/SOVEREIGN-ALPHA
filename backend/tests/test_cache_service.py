"""Unit tests for Redis caching behaviour in market_service."""
import json
from unittest.mock import AsyncMock

import pytest

from services.market_service import CACHE_TTL, get_market_data


@pytest.mark.asyncio
async def test_cache_hit_returns_without_live_fetch(monkeypatch, sample_market_data):
    cached_payload = {**sample_market_data, "source": "yfinance"}
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached_payload))

    fetch_called = False

    async def should_not_run(*_args, **_kwargs):
        nonlocal fetch_called
        fetch_called = True
        raise AssertionError("Live fetch should not run on cache hit")

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.market_service._fetch_yfinance", should_not_run)
    monkeypatch.setattr("services.market_service._fetch_ccxt", should_not_run)

    data = await get_market_data("TSLA")

    assert fetch_called is False
    assert data["price"] == cached_payload["price"]
    mock_redis.get.assert_awaited_once_with("market:TSLA")


@pytest.mark.asyncio
async def test_cache_miss_writes_ttl(monkeypatch, sample_market_data):
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()

    async def fake_yfinance(_ticker, config):
        return {**sample_market_data, "source": "yfinance"}

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.polygon_service.get_snapshot", AsyncMock(return_value=None))
    monkeypatch.setattr("services.market_service._fetch_yfinance", fake_yfinance)

    await get_market_data("TSLA")

    mock_redis.setex.assert_awaited_once()
    args = mock_redis.setex.await_args.args
    assert args[0] == "market:TSLA"
    assert args[1] == CACHE_TTL
    stored = json.loads(args[2])
    assert stored["price"] == 185.20


@pytest.mark.asyncio
async def test_redis_unavailable_still_fetches_live(monkeypatch, sample_market_data):
    monkeypatch.setattr(
        "services.market_service.get_redis",
        AsyncMock(side_effect=ConnectionError("Redis down")),
    )

    async def fake_yfinance(_ticker, config):
        return {**sample_market_data, "source": "yfinance"}

    monkeypatch.setattr("services.market_service._fetch_yfinance", fake_yfinance)

    data = await get_market_data("TSLA")
    assert data["source"] == "yfinance"
