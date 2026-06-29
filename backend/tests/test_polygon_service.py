"""Polygon service tests with mocked HTTP."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.polygon_service import (
    PolygonRateLimitError,
    get_snapshot,
    search_tickers,
)


@pytest.mark.asyncio
async def test_search_fallback_without_api_key(monkeypatch):
    monkeypatch.delenv("POLYGON_API_KEY", raising=False)
    monkeypatch.setattr("services.polygon_service.POLYGON_API_KEY", "")
    results = await search_tickers("TSL")
    assert any(r["ticker"] == "TSLA" for r in results)


@pytest.mark.asyncio
async def test_snapshot_returns_none_without_key(monkeypatch):
    monkeypatch.delenv("POLYGON_API_KEY", raising=False)
    monkeypatch.setattr("services.polygon_service.POLYGON_API_KEY", "")
    result = await get_snapshot("AAPL")
    assert result is None


@pytest.mark.asyncio
async def test_snapshot_parses_polygon_response(monkeypatch):
    monkeypatch.setenv("POLYGON_API_KEY", "test-key")
    monkeypatch.setattr("services.polygon_service.POLYGON_API_KEY", "test-key")
    monkeypatch.setattr("services.polygon_service._request_timestamps", [])

    class FakeResp:
        status_code = 200

        def json(self):
            return {
                "ticker": {
                    "lastTrade": {"p": 185.5},
                    "prevDay": {"c": 180.0},
                    "day": {"c": 185.5},
                }
            }

    mock_get = AsyncMock(return_value=FakeResp())
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = mock_get

    with patch("services.polygon_service.httpx.AsyncClient", return_value=mock_client):
        result = await get_snapshot("TSLA")
        assert result is not None
        assert result["price"] == 185.5
        assert result["source"] == "polygon"


@pytest.mark.asyncio
async def test_rate_limit_raises(monkeypatch):
    monkeypatch.setenv("POLYGON_API_KEY", "test-key")
    monkeypatch.setattr("services.polygon_service.POLYGON_API_KEY", "test-key")
    monkeypatch.setattr("services.polygon_service.POLYGON_RATE_LIMIT", 1)
    monkeypatch.setattr("services.polygon_service._request_timestamps", [9999999999.0])

    with pytest.raises(PolygonRateLimitError):
        await search_tickers("AAPL")
