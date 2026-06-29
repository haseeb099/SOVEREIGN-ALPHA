"""Unit tests for news_service."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.news_service import _classify_sentiment, _mock_events, get_news_events


def test_classify_sentiment_bullish():
    assert _classify_sentiment("Tesla stock surge beats expectations") == "Bullish"


def test_classify_sentiment_bearish():
    assert _classify_sentiment("Markets drop on weak earnings miss") == "Bearish"


def test_classify_sentiment_neutral():
    assert _classify_sentiment("Company announces quarterly update") == "Neutral"


@pytest.mark.asyncio
async def test_no_api_key_returns_mock_events(monkeypatch):
    monkeypatch.setattr("services.news_service.NEWS_API_KEY", "")
    events = await get_news_events("TSLA")
    assert len(events) == 4
    assert events[0]["type"] in {"macro", "company", "reg", "news"}


@pytest.mark.asyncio
async def test_newsapi_failure_falls_back_to_mock(monkeypatch):
    monkeypatch.setattr("services.news_service.NEWS_API_KEY", "test-key")

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "services.news_service.redis.from_url",
        AsyncMock(return_value=mock_redis),
    )

    with patch("services.news_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=RuntimeError("NewsAPI down"))
        mock_client_cls.return_value = mock_client

        events = await get_news_events("TSLA")

    assert events == _mock_events("TSLA")


@pytest.mark.asyncio
async def test_newsapi_success_returns_events(monkeypatch):
    monkeypatch.setattr("services.news_service.NEWS_API_KEY", "test-key")

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()
    monkeypatch.setattr(
        "services.news_service.redis.from_url",
        AsyncMock(return_value=mock_redis),
    )

    fake_response = MagicMock()
    fake_response.raise_for_status = MagicMock()
    fake_response.json.return_value = {
        "articles": [
            {
                "title": "Tesla rally on strong delivery numbers",
                "source": {"name": "Reuters"},
                "url": "https://example.com/1",
                "publishedAt": "2026-06-29T10:00:00Z",
            }
        ]
    }

    with patch("services.news_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=fake_response)
        mock_client_cls.return_value = mock_client

        events = await get_news_events("TSLA", limit=1)

    assert len(events) == 1
    assert events[0]["text"] == "Tesla rally on strong delivery numbers"
    assert events[0]["sentiment"] == "Bullish"
    assert events[0]["type"] == "news"


@pytest.mark.asyncio
async def test_redis_cache_hit_skips_http(monkeypatch):
    cached = [{"id": 1, "text": "Cached headline", "sentiment": "Neutral", "type": "news"}]
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached))

    monkeypatch.setattr("services.news_service.NEWS_API_KEY", "test-key")
    monkeypatch.setattr(
        "services.news_service.redis.from_url",
        AsyncMock(return_value=mock_redis),
    )

    with patch("services.news_service.httpx.AsyncClient") as mock_client_cls:
        events = await get_news_events("TSLA")
        mock_client_cls.assert_not_called()

    assert events == cached
