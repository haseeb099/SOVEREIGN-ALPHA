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
    markets = ("stocks", "etfs", "indices")
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    try:
        for market in markets:
            if len(merged) >= limit:
                break
            payload = await _polygon_get(
                "/v3/reference/tickers",
                {
                    "search": q,
                    "active": "true",
                    "market": market,
                    "limit": limit,
                },
            )
            for r in payload.get("results") or []:
                ticker = r.get("ticker", "")
                if not ticker or ticker in seen:
                    continue
                seen.add(ticker)
                merged.append(
                    {
                        "ticker": ticker,
                        "name": r.get("name", ""),
                        "market": r.get("market", market),
                        "type": r.get("type", ""),
                        "sector": r.get("sic_description") or r.get("sector") or None,
                    }
                )
                if len(merged) >= limit:
                    break
        return merged[:limit]
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


def _bar_from_agg(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize Polygon aggregate or yfinance row to OHLCV bar."""
    if "t" in row:
        return {
            "date": time.strftime("%Y-%m-%d", time.gmtime(row["t"] / 1000)),
            "open": round(float(row.get("o", row.get("c", 0))), 4),
            "high": round(float(row.get("h", row.get("c", 0))), 4),
            "low": round(float(row.get("l", row.get("c", 0))), 4),
            "close": round(float(row.get("c", 0)), 4),
            "volume": int(row.get("v", 0) or 0),
        }
    return {
        "date": row.get("date", ""),
        "open": round(float(row.get("open", row.get("close", 0))), 4),
        "high": round(float(row.get("high", row.get("close", 0))), 4),
        "low": round(float(row.get("low", row.get("close", 0))), 4),
        "close": round(float(row.get("close", 0)), 4),
        "volume": int(row.get("volume", 0) or 0),
    }


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
        last_quote = tick.get("lastQuote") or {}
        price = tick.get("lastTrade", {}).get("p") or day.get("c") or prev.get("c")
        if not price:
            return None
        prev_close = prev.get("c") or price
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
        bid = last_quote.get("p")
        ask = last_quote.get("P")
        bid_size = last_quote.get("s")
        ask_size = last_quote.get("S")
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
            "bid": round(float(bid), 4) if bid is not None else None,
            "ask": round(float(ask), 4) if ask is not None else None,
            "bid_size": int(bid_size) if bid_size is not None else None,
            "ask_size": int(ask_size) if ask_size is not None else None,
            "source": "polygon",
            "fetched_at": _last_fetch_at,
        }
    except PolygonRateLimitError:
        raise
    except Exception as exc:
        logger.warning("Polygon snapshot failed for %s: %s", symbol, exc)
        return None


async def get_depth(ticker: str) -> dict[str, Any]:
    """Bid/ask depth from Polygon snapshot (REST MVP)."""
    symbol = ticker.upper()
    snapshot = await get_snapshot(symbol)
    if not snapshot or snapshot.get("bid") is None or snapshot.get("ask") is None:
        from services.market_service import _demo_history_bars

        bars = _demo_history_bars(symbol, "1m")
        mid = float(bars[-1]["close"]) if bars else 100.0
        spread = round(mid * 0.0008, 4)
        bid = round(mid - spread / 2, 4)
        ask = round(mid + spread / 2, 4)
        return {
            "ticker": symbol,
            "bid": bid,
            "ask": ask,
            "spread": spread,
            "spread_pct": round((spread / mid) * 100, 4) if mid else None,
            "bid_size": 1200,
            "ask_size": 980,
            "levels": [
                {"side": "bid", "price": bid, "size": 1200},
                {"side": "ask", "price": ask, "size": 980},
            ],
            "source": "fallback",
        }

    bid = snapshot.get("bid")
    ask = snapshot.get("ask")
    bid_size = snapshot.get("bid_size")
    ask_size = snapshot.get("ask_size")
    spread = None
    spread_pct = None
    if bid is not None and ask is not None:
        spread = round(float(ask) - float(bid), 4)
        mid = (float(ask) + float(bid)) / 2
        spread_pct = round(spread / mid * 100, 4) if mid else None

    levels: list[dict[str, Any]] = []
    if bid is not None:
        levels.append({"side": "bid", "price": bid, "size": bid_size or 0})
    if ask is not None:
        levels.append({"side": "ask", "price": ask, "size": ask_size or 0})

    return {
        "ticker": symbol,
        "bid": bid,
        "ask": ask,
        "spread": spread,
        "spread_pct": spread_pct,
        "bid_size": bid_size,
        "ask_size": ask_size,
        "levels": levels,
        "source": snapshot.get("source", "polygon"),
        "fetched_at": snapshot.get("fetched_at"),
    }


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
        return [_bar_from_agg(r) for r in results]
    except Exception as exc:
        logger.warning("Polygon history failed for %s: %s", symbol, exc)
        return await _yfinance_history(symbol, days)


async def _yfinance_history(symbol: str, days: int) -> list[dict[str, Any]]:
    import asyncio

    import yfinance as yf

    period = "1y" if days >= 365 else "6mo" if days >= 180 else "3mo"

    def _sync():
        hist = yf.Ticker(symbol).history(period=period)
        bars: list[dict[str, Any]] = []
        for idx, row in hist.iterrows():
            close = round(float(row["Close"]), 4)
            bars.append(
                {
                    "date": idx.strftime("%Y-%m-%d"),
                    "open": round(float(row.get("Open", close)), 4),
                    "high": round(float(row.get("High", close)), 4),
                    "low": round(float(row.get("Low", close)), 4),
                    "close": close,
                    "volume": int(row.get("Volume", 0) or 0),
                }
            )
        return bars

    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _sync)
    except Exception:
        return []


async def get_earnings_calendar(ticker: str) -> list[dict[str, Any]]:
    """Earnings events for a ticker — Polygon primary, yfinance fallback, [] when unavailable."""
    symbol = ticker.upper()
    if POLYGON_API_KEY:
        try:
            payload = await _polygon_get(
                "/vX/reference/financials",
                {"ticker": symbol, "limit": 4},
            )
            results = payload.get("results") or []
            if results:
                return [
                    {
                        "source": "polygon",
                        "ticker": symbol,
                        "fiscal_period": r.get("fiscal_period"),
                        "fiscal_year": r.get("fiscal_year"),
                        "start_date": r.get("start_date"),
                        "end_date": r.get("end_date"),
                        "raw": r,
                    }
                    for r in results
                ]
        except Exception as exc:
            logger.debug("Polygon earnings lookup failed for %s: %s", symbol, exc)

    return await _yfinance_earnings(symbol)


async def _yfinance_earnings(ticker: str) -> list[dict[str, Any]]:
    """Best-effort earnings dates via yfinance."""
    try:
        import yfinance as yf

        info = await asyncio.to_thread(lambda: yf.Ticker(ticker).calendar)
        if not info or not isinstance(info, dict):
            return []
        events: list[dict[str, Any]] = []
        earnings_date = info.get("Earnings Date")
        if earnings_date is not None:
            dates = earnings_date if isinstance(earnings_date, list) else [earnings_date]
            for d in dates:
                events.append(
                    {
                        "source": "yfinance",
                        "ticker": ticker,
                        "earnings_date": str(d),
                    }
                )
        return events
    except Exception as exc:
        logger.debug("yfinance earnings lookup failed for %s: %s", ticker, exc)
        return []


async def get_earnings_overlay(ticker: str) -> Optional[dict[str, Any]]:
    """Compact earnings overlay for analyze pipeline."""
    events = await get_earnings_calendar(ticker)
    if not events:
        return None
    return {"ticker": ticker.upper(), "next_earnings": events[0], "events": events}
