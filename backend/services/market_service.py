"""
Market Data Service
Fetches live prices via Polygon.io primary, yfinance/ccxt fallback.
"""
import os
import json
import time
import asyncio
from typing import Optional
import httpx
import yfinance as yf
import redis.asyncio as redis

from services.polygon_service import get_snapshot, search_tickers

ASSET_CONFIG = {
    "TSLA": {
        "source": "yfinance",
        "ticker": "TSLA",
        "full_name": "Tesla Motors Inc.",
        "asset_class": "Equity / Auto-Tech",
        "icon": "electric_car",
    },
    "BTC": {
        "source": "ccxt",
        "ticker": "BTC/USDT",
        "full_name": "Bitcoin USD Spot",
        "asset_class": "Digital Commodity",
        "icon": "currency_bitcoin",
    },
    "XAU": {
        "source": "yfinance",
        "ticker": "GC=F",
        "full_name": "Gold Spot Ounce (USD)",
        "asset_class": "Hard Commodity",
        "icon": "savings",
    },
    "EUR": {
        "source": "yfinance",
        "ticker": "EURUSD=X",
        "full_name": "EUR/USD Spot FX",
        "asset_class": "Foreign Exchange",
        "icon": "euro_symbol",
    },
}


def resolve_ticker(asset_key: str) -> dict:
    """Resolve ticker to config — known assets or generic equity."""
    key = asset_key.upper().strip()
    if key in ASSET_CONFIG:
        return {**ASSET_CONFIG[key], "asset_key": key}
    return {
        "source": "polygon",
        "ticker": key,
        "full_name": key,
        "asset_class": "Equity",
        "icon": "trending_up",
        "asset_key": key,
    }


REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CACHE_TTL_EQUITY = int(os.environ.get("MARKET_CACHE_TTL_EQUITY", "15"))
CACHE_TTL_CRYPTO = int(os.environ.get("MARKET_CACHE_TTL_CRYPTO", "5"))
CACHE_TTL = CACHE_TTL_EQUITY  # backward compat for tests


async def get_redis():
    return await redis.from_url(REDIS_URL, decode_responses=True)


def _cache_ttl(asset_key: str, config: dict | None) -> int:
    if config and config.get("source") == "ccxt":
        return CACHE_TTL_CRYPTO
    return CACHE_TTL_EQUITY


async def search_market_tickers(query: str, limit: int = 10) -> list[dict]:
    return await search_tickers(query, limit)


async def search_market(query: str, limit: int = 10) -> list[dict]:
    """Alias for router compatibility."""
    return await search_market_tickers(query, limit)


async def get_history(ticker: str, range_key: str = "1y") -> list[dict]:
    """Price history via Polygon with yfinance fallback."""
    from services.polygon_service import get_price_history

    return await get_price_history(ticker, range_key)


def get_last_market_fetch_at() -> float | None:
    from services.polygon_service import get_last_polygon_fetch_at

    return get_last_polygon_fetch_at()


async def _fetch_with_fallbacks(key: str, config: dict) -> dict:
    """Polygon → primary source → Alpha Vantage → static fallback."""
    cfg = {**config, "asset_key": key}
    poly = await get_snapshot(key)
    if poly:
        return {
            **poly,
            "full_name": config["full_name"],
            "asset_class": config["asset_class"],
            "icon": config["icon"],
            "asset_key": key,
        }

    errors: list[str] = []
    if config["source"] == "yfinance":
        for fetch in (
            lambda: _fetch_yfinance(config["ticker"], cfg),
            lambda: _fetch_alpha_vantage(config["ticker"], cfg),
        ):
            try:
                return await fetch()
            except Exception as exc:
                errors.append(str(exc))
    elif config["source"] == "ccxt":
        try:
            return await _fetch_ccxt(config["ticker"], cfg)
        except Exception as exc:
            errors.append(str(exc))

    return _fallback_data(key, config, "; ".join(errors) or "All market sources failed")


async def get_market_data(asset_key: str) -> dict:
    """
    Fetch live market data for an asset.
    Polygon → configured source → yfinance generic → explicit fallback flag.
    """
    key = asset_key.upper()
    config = ASSET_CONFIG.get(key)
    cache_key = f"market:{key}"

    try:
        r = await get_redis()
        cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    data: dict | None = None

    if config is None:
        data = await get_snapshot(key)
        if data:
            data["asset_key"] = key
        else:
            try:
                data = await _fetch_yfinance(key, {
                    "full_name": key,
                    "asset_class": "Equity",
                    "icon": "trending_up",
                    "asset_key": key,
                })
            except Exception as e:
                try:
                    data = await _fetch_alpha_vantage(key, {
                        "full_name": key,
                        "asset_class": "Equity",
                        "icon": "trending_up",
                        "asset_key": key,
                    })
                except Exception:
                    data = _fallback_data(key, {
                        "full_name": key,
                        "asset_class": "Equity",
                        "icon": "trending_up",
                    }, str(e))
    else:
        data = await _fetch_with_fallbacks(key, config)

    if data is None:
        cfg = config or {"full_name": key, "asset_class": "Equity", "icon": "trending_up"}
        data = _fallback_data(key, cfg, "All market sources failed")

    try:
        r = await get_redis()
        ttl = _cache_ttl(key, config)
        await r.setex(cache_key, ttl, json.dumps(data))
    except Exception:
        pass

    return data


async def _fetch_yfinance(ticker_str: str, config: dict) -> dict:
    loop = asyncio.get_event_loop()

    def _sync_fetch():
        ticker = yf.Ticker(ticker_str)
        info = ticker.fast_info
        current_price = info.last_price or 0
        if not current_price:
            raise RuntimeError(f"No price for {ticker_str}")
        prev_close = info.previous_close or current_price
        change_pct = ((current_price - prev_close) / prev_close * 100) if prev_close else 0
        hist = ticker.history(period="30d")
        if len(hist) > 1:
            returns = hist["Close"].pct_change().dropna()
            volatility_30d = float(returns.std() * (252 ** 0.5) * 100)
        else:
            volatility_30d = 0.0
        return {
            "asset_key": config.get("asset_key", ticker_str),
            "full_name": config["full_name"],
            "asset_class": config["asset_class"],
            "icon": config.get("icon", "trending_up"),
            "price": round(current_price, 4),
            "change_pct": round(change_pct, 2),
            "is_positive": change_pct >= 0,
            "volatility_30d": round(volatility_30d, 1),
            "source": "yfinance",
            "fetched_at": time.time(),
        }

    return await loop.run_in_executor(None, _sync_fetch)


async def _fetch_alpha_vantage(ticker_str: str, config: dict) -> dict:
    """Alpha Vantage GLOBAL_QUOTE fallback when yfinance is rate-limited."""
    api_key = os.environ.get("ALPHA_VANTAGE_KEY", "")
    if not api_key:
        raise RuntimeError("ALPHA_VANTAGE_KEY not set")

    url = "https://www.alphavantage.co/query"
    params = {"function": "GLOBAL_QUOTE", "symbol": ticker_str, "apikey": api_key}
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        payload = resp.json()

    quote = payload.get("Global Quote") or {}
    price = float(quote.get("05. price") or 0)
    if not price:
        raise RuntimeError(f"Alpha Vantage returned no quote for {ticker_str}")

    change_pct = float(quote.get("10. change percent", "0").replace("%", "") or 0)
    return {
        "asset_key": config.get("asset_key", ticker_str),
        "full_name": config["full_name"],
        "asset_class": config["asset_class"],
        "icon": config.get("icon", "trending_up"),
        "price": round(price, 4),
        "change_pct": round(change_pct, 2),
        "is_positive": change_pct >= 0,
        "volatility_30d": 0.0,
        "source": "alpha_vantage",
        "fetched_at": time.time(),
    }


async def _fetch_ccxt(symbol: str, config: dict) -> dict:
    try:
        import ccxt.async_support as ccxt

        exchange = ccxt.binance()
        ticker = await exchange.fetch_ticker(symbol)
        await exchange.close()
        price = ticker["last"] or 0
        change_pct = ticker.get("percentage", 0) or 0
        high = ticker.get("high", price)
        low = ticker.get("low", price)
        volatility_est = ((high - low) / price * 100) if price else 0
        return {
            "asset_key": config.get("asset_key", symbol),
            "full_name": config["full_name"],
            "asset_class": config["asset_class"],
            "icon": config["icon"],
            "price": round(price, 2),
            "change_pct": round(change_pct, 2),
            "is_positive": change_pct >= 0,
            "volatility_30d": round(volatility_est * 2.5, 1),
            "source": "ccxt_binance",
            "fetched_at": time.time(),
        }
    except ImportError:
        raise RuntimeError("ccxt not installed")


def _fallback_data(asset_key: str, config: dict, error: str) -> dict:
    fallback_prices = {
        "TSLA": {"price": 185.20, "change_pct": 2.4, "volatility_30d": 38.4},
        "BTC": {"price": 94250.00, "change_pct": 5.8, "volatility_30d": 54.2},
        "XAU": {"price": 2410.50, "change_pct": -0.4, "volatility_30d": 14.1},
        "EUR": {"price": 1.0820, "change_pct": 0.1, "volatility_30d": 8.5},
    }
    fb = fallback_prices.get(asset_key, {"price": 100.0, "change_pct": 0, "volatility_30d": 20.0})
    return {
        "asset_key": asset_key,
        "full_name": config["full_name"],
        "asset_class": config["asset_class"],
        "icon": config.get("icon", "trending_up"),
        "price": fb["price"],
        "change_pct": fb["change_pct"],
        "is_positive": fb["change_pct"] >= 0,
        "volatility_30d": fb["volatility_30d"],
        "source": "fallback",
        "error": error,
        "fetched_at": time.time(),
    }
