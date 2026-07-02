"""Financial snapshot fetch — Polygon primary, yfinance fallback, Redis cache."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import redis.asyncio as redis
import yfinance as yf

from services.polygon_service import POLYGON_API_KEY, _polygon_get

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
FINANCIALS_CACHE_TTL = int(os.environ.get("FINANCIALS_CACHE_TTL", "600"))


async def get_redis():
    return await redis.from_url(REDIS_URL, decode_responses=True)


def _normalize_snapshot(ticker: str, raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize heterogeneous inputs into FinancialSnapshot dict."""
    shares = raw.get("shares_outstanding")
    price = raw.get("current_price")
    market_cap = raw.get("market_cap")
    if market_cap is None and shares and price:
        market_cap = float(shares) * float(price)

    net_debt = raw.get("net_debt")
    if net_debt is None:
        total_debt = raw.get("total_debt")
        cash = raw.get("cash")
        if total_debt is not None and cash is not None:
            net_debt = float(total_debt) - float(cash)

    ev = raw.get("enterprise_value")
    if ev is None and market_cap is not None and net_debt is not None:
        ev = float(market_cap) + float(net_debt)

    insufficient = raw.get("insufficient_data", False)
    if not insufficient and not any(
        raw.get(k) is not None for k in ("revenue", "ebitda", "fcf", "shares_outstanding")
    ):
        insufficient = True

    return {
        "ticker": ticker.upper(),
        "revenue": _num(raw.get("revenue")),
        "ebitda": _num(raw.get("ebitda")),
        "fcf": _num(raw.get("fcf")),
        "net_debt": _num(net_debt),
        "shares_outstanding": _num(shares),
        "beta": _num(raw.get("beta")),
        "current_price": _num(price),
        "market_cap": _num(market_cap),
        "enterprise_value": _num(ev),
        "source": raw.get("source", "unknown"),
        "insufficient_data": insufficient,
        "message": raw.get("message"),
    }


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        n = float(value)
        return n if n == n else None  # NaN check
    except (TypeError, ValueError):
        return None


async def _fetch_polygon_financials(ticker: str) -> dict[str, Any] | None:
    if not POLYGON_API_KEY:
        return None
    try:
        payload = await _polygon_get(
            "/vX/reference/financials",
            {"ticker": ticker.upper(), "limit": 1, "sort": "period_of_report_date", "order": "desc"},
        )
        results = payload.get("results") or []
        if not results:
            return None
        row = results[0]
        financials = row.get("financials") or {}
        income = financials.get("income_statement") or {}
        balance = financials.get("balance_sheet") or {}
        cashflow = financials.get("cash_flow_statement") or {}

        revenue = _extract_value(income, "revenues", "revenue")
        ebitda = _extract_value(income, "ebitda")
        fcf = _extract_value(cashflow, "net_cash_flow_from_operating_activities")
        if fcf is not None:
            capex = _extract_value(cashflow, "net_cash_flow_from_investing_activities")
            if capex is not None:
                fcf = fcf + capex  # capex usually negative

        total_debt = _extract_value(balance, "long_term_debt", "debt")
        cash = _extract_value(balance, "cash_and_cash_equivalents", "cash")
        net_debt = None
        if total_debt is not None and cash is not None:
            net_debt = total_debt - cash

        return {
            "revenue": revenue,
            "ebitda": ebitda,
            "fcf": fcf,
            "net_debt": net_debt,
            "total_debt": total_debt,
            "cash": cash,
            "source": "polygon",
        }
    except Exception as exc:
        logger.debug("Polygon financials failed for %s: %s", ticker, exc)
        return None


def _extract_value(section: dict, *keys: str) -> float | None:
    for key in keys:
        node = section.get(key)
        if isinstance(node, dict):
            val = node.get("value")
            if val is not None:
                return _num(val)
        elif node is not None:
            return _num(node)
    return None


async def _fetch_yfinance_financials(ticker: str) -> dict[str, Any]:
    loop = asyncio.get_event_loop()

    def _sync() -> dict[str, Any]:
        try:
            t = yf.Ticker(ticker.upper())
            info = t.info or {}
        except Exception as exc:
            logger.warning("yfinance financials failed for %s: %s", ticker, exc)
            return {
                "insufficient_data": True,
                "message": "Financial data temporarily unavailable (upstream rate limit or network error)",
                "source": "yfinance",
            }
        asset_class = (info.get("quoteType") or "").upper()
        if asset_class in ("ETF", "MUTUALFUND", "CRYPTOCURRENCY"):
            return {
                "insufficient_data": True,
                "message": f"{asset_class} assets are not supported for DCF/LBO modeling",
                "source": "yfinance",
                "current_price": info.get("regularMarketPrice") or info.get("currentPrice"),
                "beta": info.get("beta"),
            }

        revenue = info.get("totalRevenue")
        ebitda = info.get("ebitda")
        fcf = info.get("freeCashflow")
        shares = info.get("sharesOutstanding")
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        market_cap = info.get("marketCap")
        total_debt = info.get("totalDebt")
        cash = info.get("totalCash")
        beta = info.get("beta")

        return {
            "revenue": revenue,
            "ebitda": ebitda,
            "fcf": fcf,
            "shares_outstanding": shares,
            "current_price": price,
            "market_cap": market_cap,
            "total_debt": total_debt,
            "cash": cash,
            "beta": beta,
            "source": "yfinance",
        }

    return await loop.run_in_executor(None, _sync)


async def fetch_financial_snapshot(ticker: str) -> dict[str, Any]:
    """Fetch normalized financial snapshot with Redis cache."""
    symbol = ticker.upper()
    cache_key = f"financials:{symbol}"

    try:
        r = await get_redis()
        cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    raw: dict[str, Any] = {}
    polygon_data = await _fetch_polygon_financials(symbol)
    if polygon_data:
        raw.update(polygon_data)

    yf_data = await _fetch_yfinance_financials(symbol)
    for key, val in yf_data.items():
        if raw.get(key) is None and val is not None:
            raw[key] = val

    if yf_data.get("insufficient_data"):
        raw["insufficient_data"] = True
        raw["message"] = yf_data.get("message")

    snapshot = _normalize_snapshot(symbol, raw)

    try:
        r = await get_redis()
        await r.setex(cache_key, FINANCIALS_CACHE_TTL, json.dumps(snapshot))
    except Exception:
        pass

    return snapshot
