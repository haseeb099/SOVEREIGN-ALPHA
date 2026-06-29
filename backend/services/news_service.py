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
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CACHE_TTL = 300  # 5 minutes for news

# Asset → search query mapping
ASSET_SEARCH_TERMS = {
    "TSLA": "Tesla stock OR Tesla earnings OR Tesla FSD",
    "BTC": "Bitcoin price OR Bitcoin ETF OR crypto regulation",
    "XAU": "gold price OR gold futures OR central bank gold",
    "EUR": "EUR USD OR ECB interest rates OR eurozone economy",
}


async def get_news_events(asset_key: str, limit: int = 5) -> list[dict]:
    """
    Fetch live news events for an asset.
    Returns list of events compatible with MOCK_EVENTS schema used in frontend.
    """
    if not NEWS_API_KEY:
        return _mock_events(asset_key)

    cache_key = f"news:{asset_key}"

    try:
        r = await redis.from_url(REDIS_URL, decode_responses=True)
        cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    try:
        query = ASSET_SEARCH_TERMS.get(asset_key, asset_key)
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
            events.append({
                "id": i + 1,
                "text": article.get("title", ""),
                "source": article.get("source", {}).get("name", "News"),
                "url": article.get("url", ""),
                "published_at": article.get("publishedAt", ""),
                "sentiment": _classify_sentiment(article.get("title", "")),
                "type": "news",
                # Slider delta values — set to 0, let AI interpret
                "margins": 0,
                "rates": 0,
                "regulatory": 0,
            })

        try:
            r = await redis.from_url(REDIS_URL, decode_responses=True)
            await r.setex(cache_key, CACHE_TTL, json.dumps(events))
        except Exception:
            pass

        return events

    except Exception:
        return _mock_events(asset_key)


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


def _mock_events(asset_key: str) -> list[dict]:
    """Fallback events when NEWS_API_KEY not set — same as prototype."""
    return [
        {"id": 1, "text": "Federal Reserve announces sudden 25bps cut.", "margins": 0, "rates": -0.25, "regulatory": 0, "sentiment": "Bullish", "type": "macro"},
        {"id": 2, "text": "Target operating margins report drops below projections.", "margins": -2.0, "rates": 0, "regulatory": 1, "sentiment": "Bearish", "type": "company"},
        {"id": 3, "text": "SEC drops key investigations, reducing regulatory headwinds.", "margins": 0, "rates": 0, "regulatory": -1, "sentiment": "Bullish", "type": "reg"},
        {"id": 4, "text": "Geopolitical flare-up drives safe-haven capital into bonds/commodities.", "margins": 1.0, "rates": 0.1, "regulatory": 0, "sentiment": "Neutral", "type": "macro"},
    ]
