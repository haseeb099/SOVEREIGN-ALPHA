"""Unit tests for news_service."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.news_service import _classify_sentiment, _mock_events, get_news_events, get_news_feed


def test_classify_sentiment_bullish():
    assert _classify_sentiment("Tesla stock surge beats expectations") == "Bullish"


def test_classify_sentiment_bearish():
    assert _classify_sentiment("Markets drop on weak earnings miss") == "Bearish"


def test_classify_sentiment_neutral():
    assert _classify_sentiment("Company announces quarterly update") == "Neutral"


@pytest.mark.asyncio
async def test_no_api_key_returns_mock_events(monkeypatch):
    monkeypatch.setattr("services.news_service.NEWS_API_KEY", "")
    monkeypatch.setattr("services.news_service.POLYGON_API_KEY", "")
    feed = await get_news_feed("TSLA")
    assert len(feed["events"]) == 4
    assert feed["events"][0]["type"] in {"macro", "company", "reg", "news"}
    assert "ticker_sentiment_score" in feed
    assert "bullish_pct" in feed


@pytest.mark.asyncio
async def test_newsapi_failure_falls_back_to_mock(monkeypatch):
    monkeypatch.setattr("services.news_service.NEWS_API_KEY", "test-key")
    monkeypatch.setattr("services.news_service.POLYGON_API_KEY", "")

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

        feed = await get_news_feed("TSLA")

    assert len(feed["events"]) == 4
    assert feed["events"][0]["text"] == _mock_events("TSLA")[0]["text"]
    assert "sentiment_score" in feed["events"][0]


@pytest.mark.asyncio
async def test_newsapi_success_returns_events(monkeypatch):
    monkeypatch.setattr("services.news_service.NEWS_API_KEY", "test-key")
    monkeypatch.setattr("services.news_service.POLYGON_API_KEY", "")

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
    assert "sentiment_score" in events[0]
    assert events[0]["type"] == "news"


@pytest.mark.asyncio
async def test_redis_cache_hit_skips_http(monkeypatch):
    cached = {
        "events": [{"id": 1, "text": "Cached headline", "sentiment": "Neutral", "type": "news"}],
        "ticker_sentiment_score": 0.0,
        "bullish_pct": 0.0,
        "bearish_pct": 0.0,
        "neutral_pct": 100.0,
    }
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached))

    monkeypatch.setattr("services.news_service.NEWS_API_KEY", "test-key")
    monkeypatch.setattr("services.news_service.POLYGON_API_KEY", "")
    monkeypatch.setattr(
        "services.news_service.redis.from_url",
        AsyncMock(return_value=mock_redis),
    )

    with patch("services.news_service.httpx.AsyncClient") as mock_client_cls:
        feed = await get_news_feed("TSLA")
        mock_client_cls.assert_not_called()

    assert feed == cached
