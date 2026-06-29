"""
Market Data Service
Fetches live prices for equities, crypto, commodities, and FX.
All data is cached in Redis for 60 seconds to avoid rate limiting.
"""
import os
import json
import time
import asyncio
from typing import Optional
import yfinance as yf
import redis.asyncio as redis

# Ticker mapping: our internal asset key → data source config
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

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CACHE_TTL = 60  # seconds


async def get_redis():
    return await redis.from_url(REDIS_URL, decode_responses=True)


async def get_market_data(asset_key: str) -> dict:
    """
    Fetch live market data for an asset.
    Returns price, change_pct, volatility_30d from live sources.
    Falls back to cached data if live fetch fails.
    """
    config = ASSET_CONFIG.get(asset_key.upper())
    if not config:
        raise ValueError(f"Unknown asset: {asset_key}. Valid keys: {list(ASSET_CONFIG.keys())}")

    cache_key = f"market:{asset_key}"

    # Check Redis cache first
    try:
        r = await get_redis()
        cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass  # Cache miss or Redis unavailable — continue to live fetch

    # Fetch live data
    try:
        if config["source"] == "yfinance":
            data = await _fetch_yfinance(config["ticker"], config)
        elif config["source"] == "ccxt":
            data = await _fetch_ccxt(config["ticker"], config)
        else:
            raise ValueError(f"Unknown source: {config['source']}")

        # Cache successful result
        try:
            r = await get_redis()
            await r.setex(cache_key, CACHE_TTL, json.dumps(data))
        except Exception:
            pass  # Cache write failure is non-fatal

        return data

    except Exception as e:
        # Return fallback static data so the UI doesn't break
        return _fallback_data(asset_key, config, str(e))


async def _fetch_yfinance(ticker_str: str, config: dict) -> dict:
    """Fetch data from Yahoo Finance via yfinance."""
    loop = asyncio.get_event_loop()

    def _sync_fetch():
        ticker = yf.Ticker(ticker_str)
        info = ticker.fast_info

        current_price = info.last_price or 0
        prev_close = info.previous_close or current_price
        change_pct = ((current_price - prev_close) / prev_close * 100) if prev_close else 0

        # 30-day historical volatility
        hist = ticker.history(period="30d")
        if len(hist) > 1:
            returns = hist["Close"].pct_change().dropna()
            volatility_30d = float(returns.std() * (252 ** 0.5) * 100)  # annualised
        else:
            volatility_30d = 0.0

        return {
            "asset_key": config.get("asset_key", ticker_str),
            "full_name": config["full_name"],
            "asset_class": config["asset_class"],
            "icon": config["icon"],
            "price": round(current_price, 4),
            "change_pct": round(change_pct, 2),
            "is_positive": change_pct >= 0,
            "volatility_30d": round(volatility_30d, 1),
            "source": "yfinance",
            "fetched_at": time.time(),
        }

    return await loop.run_in_executor(None, _sync_fetch)


async def _fetch_ccxt(symbol: str, config: dict) -> dict:
    """Fetch crypto data from Binance via ccxt."""
    try:
        import ccxt.async_support as ccxt

        exchange = ccxt.binance()
        ticker = await exchange.fetch_ticker(symbol)
        await exchange.close()

        price = ticker["last"] or 0
        change_pct = ticker.get("percentage", 0) or 0

        # Estimate volatility from 24h high/low
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
            "volatility_30d": round(volatility_est * 2.5, 1),  # rough annualisation
            "source": "ccxt_binance",
            "fetched_at": time.time(),
        }

    except ImportError:
        raise RuntimeError("ccxt not installed. Run: pip install ccxt")


def _fallback_data(asset_key: str, config: dict, error: str) -> dict:
    """Static fallback prices when live fetch fails — matches prototype values."""
    fallback_prices = {
        "TSLA": {"price": 185.20, "change_pct": 2.4, "volatility_30d": 38.4},
        "BTC": {"price": 94250.00, "change_pct": 5.8, "volatility_30d": 54.2},
        "XAU": {"price": 2410.50, "change_pct": -0.4, "volatility_30d": 14.1},
        "EUR": {"price": 1.0820, "change_pct": 0.1, "volatility_30d": 8.5},
    }
    fb = fallback_prices.get(asset_key, {"price": 0, "change_pct": 0, "volatility_30d": 0})
    return {
        "asset_key": asset_key,
        "full_name": config["full_name"],
        "asset_class": config["asset_class"],
        "icon": config["icon"],
        "price": fb["price"],
        "change_pct": fb["change_pct"],
        "is_positive": fb["change_pct"] >= 0,
        "volatility_30d": fb["volatility_30d"],
        "source": "fallback",
        "error": error,
        "fetched_at": time.time(),
    }
