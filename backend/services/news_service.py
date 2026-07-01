"""
News Service
Fetches live macro/company news for a given asset.
Uses NewsAPI free tier (100 req/day) with Redis caching.
"""
import os
import json
import time
import httpx
import redis.asyncio as redis

NEWS_API_KEY = os.environ.get("NEWS_API_KEY", "")
POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CACHE_TTL = 300  # 5 minutes for news

# Asset → search query mapping
ASSET_SEARCH_TERMS = {
    "TSLA": "Tesla stock OR Tesla earnings OR Tesla FSD",
    "SPY": "S&P 500 OR SPY ETF OR stock market",
    "QQQ": "Nasdaq OR QQQ OR tech stocks",
    "BTC": "Bitcoin price OR Bitcoin ETF OR crypto regulation",
    "ETH": "Ethereum price OR ETH ETF OR crypto",
    "XAU": "gold price OR gold futures OR central bank gold",
    "GLD": "gold ETF OR gold price OR GLD",
    "EUR": "EUR USD OR ECB interest rates OR eurozone economy",
    "TLT": "Treasury bonds OR TLT OR Fed rates",
}


def _sentiment_label_to_score(label: str) -> float:
    mapping = {"Bullish": 0.6, "Bearish": -0.6, "Neutral": 0.0}
    return mapping.get(label, 0.0)


def _classify_sentiment(headline: str) -> str:
    """Simple keyword-based sentiment classification."""
    headline_lower = headline.lower()
    bullish_words = ["surge", "rally", "soar", "beat", "strong", "growth", "gain", "rise", "high"]
    bearish_words = ["drop", "fall", "miss", "weak", "decline", "crash", "loss", "low", "cut", "risk"]

    bull_count = sum(1 for w in bullish_words if w in headline_lower)
    bear_count = sum(1 for w in bearish_words if w in headline_lower)

    if bull_count > bear_count:
        return "Bullish"
    elif bear_count > bull_count:
        return "Bearish"
    return "Neutral"


def _score_headline(headline: str) -> float:
    """Per-article sentiment score in [-1, 1]."""
    label = _classify_sentiment(headline)
    headline_lower = headline.lower()
    bullish_words = ["surge", "rally", "soar", "beat", "strong", "growth", "gain", "rise", "high"]
    bearish_words = ["drop", "fall", "miss", "weak", "decline", "crash", "loss", "low", "cut", "risk"]
    bull_count = sum(1 for w in bullish_words if w in headline_lower)
    bear_count = sum(1 for w in bearish_words if w in headline_lower)
    total = bull_count + bear_count
    if total == 0:
        return _sentiment_label_to_score(label)
    raw = (bull_count - bear_count) / total
    return round(max(-1.0, min(1.0, raw)), 4)


def _aggregate_sentiment(events: list[dict]) -> dict:
    if not events:
        return {
            "ticker_sentiment_score": 0.0,
            "bullish_pct": 0.0,
            "bearish_pct": 0.0,
            "neutral_pct": 100.0,
        }
    scores = [float(e.get("sentiment_score", 0)) for e in events]
    labels = [e.get("sentiment", "Neutral") for e in events]
    n = len(events)
    bullish = sum(1 for l in labels if l == "Bullish")
    bearish = sum(1 for l in labels if l == "Bearish")
    neutral = n - bullish - bearish
    return {
        "ticker_sentiment_score": round(sum(scores) / n, 4),
        "bullish_pct": round(bullish / n * 100, 2),
        "bearish_pct": round(bearish / n * 100, 2),
        "neutral_pct": round(neutral / n * 100, 2),
    }


def _enrich_event(event: dict) -> dict:
    headline = event.get("text") or event.get("title") or ""
    sentiment = event.get("sentiment") or _classify_sentiment(headline)
    return {
        **event,
        "sentiment": sentiment,
        "sentiment_score": event.get("sentiment_score", _score_headline(headline)),
    }


async def _fetch_polygon_news(asset_key: str, limit: int) -> list[dict]:
    if not POLYGON_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.polygon.io/v2/reference/news",
                params={
                    "ticker": asset_key,
                    "limit": limit,
                    "apiKey": POLYGON_API_KEY,
                },
            )
            if resp.status_code != 200:
                return []
            results = resp.json().get("results") or []
        events = []
        for i, article in enumerate(results[:limit]):
            title = article.get("title", "")
            events.append(
                {
                    "id": article.get("id", i + 1),
                    "text": title,
                    "source": (article.get("publisher") or {}).get("name", "Polygon"),
                    "url": article.get("article_url", ""),
                    "published_at": article.get("published_utc", ""),
                    "type": "news",
                    "margins": 0,
                    "rates": 0,
                    "regulatory": 0,
                    "sentiment": _classify_sentiment(title),
                    "sentiment_score": _score_headline(title),
                }
            )
        return events
    except Exception:
        return []


async def get_news_events(asset_key: str, limit: int = 5) -> list[dict]:
    """
    Fetch live news events for an asset.
    Returns list of events compatible with MOCK_EVENTS schema used in frontend.
    """
    feed = await get_news_feed(asset_key, limit=limit)
    return feed["events"]


async def get_news_feed(asset_key: str, limit: int = 5) -> dict:
    """News events plus aggregate ticker sentiment."""
    key = asset_key.upper()

    polygon_events = await _fetch_polygon_news(key, limit)
    if polygon_events:
        enriched = [_enrich_event(e) for e in polygon_events]
        return {"events": enriched, **_aggregate_sentiment(enriched)}

    if not NEWS_API_KEY:
        enriched = [_enrich_event(e) for e in _mock_events(key)]
        return {"events": enriched[:limit], **_aggregate_sentiment(enriched[:limit])}

    cache_key = f"news:{key}"

    try:
        r = await redis.from_url(REDIS_URL, decode_responses=True)
        cached = await r.get(cache_key)
        if cached:
            payload = json.loads(cached)
            if isinstance(payload, dict) and "events" in payload:
                return payload
            enriched = [_enrich_event(e) for e in payload]
            return {"events": enriched, **_aggregate_sentiment(enriched)}
    except Exception:
        pass

    try:
        query = ASSET_SEARCH_TERMS.get(key, key)
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": query,
            "sortBy": "publishedAt",
            "pageSize": limit,
            "language": "en",
            "apiKey": NEWS_API_KEY,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            articles = resp.json().get("articles", [])

        events = []
        for i, article in enumerate(articles[:limit]):
            title = article.get("title", "")
            events.append(
                {
                    "id": i + 1,
                    "text": title,
                    "source": article.get("source", {}).get("name", "News"),
                    "url": article.get("url", ""),
                    "published_at": article.get("publishedAt", ""),
                    "sentiment": _classify_sentiment(title),
                    "sentiment_score": _score_headline(title),
                    "type": "news",
                    "margins": 0,
                    "rates": 0,
                    "regulatory": 0,
                }
            )

        enriched = [_enrich_event(e) for e in events]
        payload = {"events": enriched, **_aggregate_sentiment(enriched)}

        try:
            r = await redis.from_url(REDIS_URL, decode_responses=True)
            await r.setex(cache_key, CACHE_TTL, json.dumps(payload))
        except Exception:
            pass

        return payload

    except Exception:
        enriched = [_enrich_event(e) for e in _mock_events(key)]
        return {"events": enriched[:limit], **_aggregate_sentiment(enriched[:limit])}


def _mock_events(asset_key: str) -> list[dict]:
    """Fallback events when NEWS_API_KEY not set — same as prototype."""
    return [
        {"id": 1, "text": "Federal Reserve announces sudden 25bps cut.", "margins": 0, "rates": -0.25, "regulatory": 0, "sentiment": "Bullish", "type": "macro"},
        {"id": 2, "text": "Target operating margins report drops below projections.", "margins": -2.0, "rates": 0, "regulatory": 1, "sentiment": "Bearish", "type": "company"},
        {"id": 3, "text": "SEC drops key investigations, reducing regulatory headwinds.", "margins": 0, "rates": 0, "regulatory": -1, "sentiment": "Bullish", "type": "reg"},
        {"id": 4, "text": "Geopolitical flare-up drives safe-haven capital into bonds/commodities.", "margins": 1.0, "rates": 0.1, "regulatory": 0, "sentiment": "Neutral", "type": "macro"},
    ]
