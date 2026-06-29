"""Polygon.io market data client with graceful fallback when unconfigured."""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")
POLYGON_BASE_URL = os.environ.get("POLYGON_BASE_URL", "https://api.polygon.io").rstrip("/")
POLYGON_RATE_LIMIT = int(os.environ.get("POLYGON_RATE_LIMIT_PER_MIN", "5"))

_last_fetch_at: float | None = None
_request_timestamps: list[float] = []
_rate_lock = asyncio.Lock()


class PolygonError(Exception):
    """Base Polygon client error."""


class PolygonRateLimitError(PolygonError):
    """Raised when client-side rate limit is exceeded."""


class PolygonAPIError(PolygonError):
    """Raised when Polygon returns a non-success response."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Polygon API {status_code}: {detail}")


def get_last_polygon_fetch_at() -> float | None:
    return _last_fetch_at


async def _throttle() -> None:
    """Simple sliding-window rate limiter (requests per minute)."""
    async with _rate_lock:
        now = time.time()
        window_start = now - 60.0
        while _request_timestamps and _request_timestamps[0] < window_start:
            _request_timestamps.pop(0)
        if len(_request_timestamps) >= POLYGON_RATE_LIMIT:
            raise PolygonRateLimitError(
                f"Polygon rate limit exceeded ({POLYGON_RATE_LIMIT}/min)"
            )
        _request_timestamps.append(now)


async def _polygon_get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    if not POLYGON_API_KEY:
        raise PolygonError("POLYGON_API_KEY not configured")
    await _throttle()
    query = dict(params or {})
    query["apiKey"] = POLYGON_API_KEY
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{POLYGON_BASE_URL}{path}", params=query)
    except httpx.TimeoutException as exc:
        raise PolygonError("Polygon request timed out") from exc
    except httpx.HTTPError as exc:
        raise PolygonError(f"Polygon HTTP error: {exc}") from exc

    if resp.status_code == 429:
        raise PolygonRateLimitError("Polygon upstream rate limit (429)")
    if resp.status_code != 200:
        detail = resp.text[:200] if resp.text else resp.reason_phrase
        raise PolygonAPIError(resp.status_code, detail)

    return resp.json()


async def polygon_available() -> bool:
    if not POLYGON_API_KEY:
        return False
    try:
        await _polygon_get("/v3/reference/tickers", {"ticker": "AAPL", "active": "true", "limit": 1})
        return True
    except Exception as exc:
        logger.debug("Polygon availability check failed: %s", exc)
        return False


async def search_tickers(query: str, limit: int = 10) -> list[dict[str, Any]]:
    q = query.strip().upper()
    if not q:
        return []
    if not POLYGON_API_KEY:
        return _local_search_fallback(q, limit)
    try:
        payload = await _polygon_get(
            "/v3/reference/tickers",
            {"search": q, "active": "true", "market": "stocks", "limit": limit},
        )
        results = payload.get("results") or []
        return [
            {
                "ticker": r.get("ticker", ""),
                "name": r.get("name", ""),
                "market": r.get("market", "stocks"),
                "type": r.get("type", ""),
                "sector": r.get("sic_description") or r.get("sector") or None,
            }
            for r in results
        ]
    except PolygonRateLimitError:
        raise
    except Exception as exc:
        logger.warning("Polygon search failed for %s: %s — using local fallback", q, exc)
        return _local_search_fallback(q, limit)


async def get_ticker_sector(ticker: str) -> str | None:
    """Reference data sector/industry for portfolio analytics."""
    symbol = ticker.upper()
    if not POLYGON_API_KEY:
        return await _yfinance_sector(symbol)
    try:
        payload = await _polygon_get(f"/v3/reference/tickers/{symbol}")
        result = payload.get("results") or {}
        return (
            result.get("sic_description")
            or result.get("sector")
            or result.get("industry")
        )
    except Exception as exc:
        logger.debug("Polygon sector lookup failed for %s: %s", symbol, exc)
        return await _yfinance_sector(symbol)


async def _yfinance_sector(symbol: str) -> str | None:
    import asyncio

    import yfinance as yf

    def _sync() -> str | None:
        try:
            info = yf.Ticker(symbol).info
            return info.get("sector") or info.get("industry")
        except Exception:
            return None

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync)


def _local_search_fallback(query: str, limit: int) -> list[dict[str, Any]]:
    from services.market_service import ASSET_CONFIG

    matches = []
    for key, cfg in ASSET_CONFIG.items():
        if query in key or query.lower() in cfg["full_name"].lower():
            matches.append(
                {
                    "ticker": key,
                    "name": cfg["full_name"],
                    "market": cfg["asset_class"],
                    "type": "fallback",
                    "sector": cfg.get("asset_class"),
                }
            )
    return matches[:limit]


async def get_snapshot(ticker: str) -> Optional[dict[str, Any]]:
    global _last_fetch_at
    symbol = ticker.upper()
    if not POLYGON_API_KEY:
        return None
    try:
        payload = await _polygon_get(f"/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}")
        tick = payload.get("ticker") or {}
        day = tick.get("day") or {}
        prev = tick.get("prevDay") or {}
        price = tick.get("lastTrade", {}).get("p") or day.get("c") or prev.get("c")
        if not price:
            return None
        prev_close = prev.get("c") or price
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
        _last_fetch_at = time.time()
        return {
            "asset_key": symbol,
            "full_name": symbol,
            "asset_class": "Equity",
            "icon": "trending_up",
            "price": round(float(price), 4),
            "change_pct": round(change_pct, 2),
            "is_positive": change_pct >= 0,
            "volatility_30d": round(abs(change_pct) * 3.5, 1),
            "source": "polygon",
            "fetched_at": _last_fetch_at,
        }
    except PolygonRateLimitError:
        raise
    except Exception as exc:
        logger.warning("Polygon snapshot failed for %s: %s", symbol, exc)
        return None


async def get_price_history(ticker: str, range_key: str = "1y") -> list[dict[str, Any]]:
    symbol = ticker.upper()
    days_map = {"1m": 30, "3m": 90, "6m": 180, "1y": 365, "2y": 730}
    days = days_map.get(range_key, 365)
    if not POLYGON_API_KEY:
        return await _yfinance_history(symbol, days)
    try:
        from datetime import datetime, timedelta

        end = datetime.utcnow().date()
        start = end - timedelta(days=days)
        payload = await _polygon_get(
            f"/v2/aggs/ticker/{symbol}/range/1/day/{start}/{end}",
            {"adjusted": "true", "sort": "asc"},
        )
        results = payload.get("results") or []
        return [
            {"date": time.strftime("%Y-%m-%d", time.gmtime(r["t"] / 1000)), "close": r["c"]}
            for r in results
        ]
    except Exception as exc:
        logger.warning("Polygon history failed for %s: %s", symbol, exc)
        return await _yfinance_history(symbol, days)


async def _yfinance_history(symbol: str, days: int) -> list[dict[str, Any]]:
    import asyncio

    import yfinance as yf

    period = "1y" if days >= 365 else "6mo" if days >= 180 else "3mo"

    def _sync():
        hist = yf.Ticker(symbol).history(period=period)
        return [
            {"date": idx.strftime("%Y-%m-%d"), "close": round(float(row["Close"]), 4)}
            for idx, row in hist.iterrows()
        ]

    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _sync)
    except Exception:
        return []


async def get_earnings_calendar(ticker: str) -> Optional[dict[str, Any]]:
    if not POLYGON_API_KEY:
        return None
    try:
        payload = await _polygon_get(
            "/vX/reference/financials",
            {"ticker": ticker.upper(), "limit": 1},
        )
        results = payload.get("results") or []
        if not results:
            return None
        return {"ticker": ticker.upper(), "next_earnings": results[0]}
    except Exception as exc:
        logger.debug("Polygon earnings lookup failed for %s: %s", ticker, exc)
        return None
