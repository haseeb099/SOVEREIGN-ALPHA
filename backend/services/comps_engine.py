"""Comparable company multiples engine."""
from __future__ import annotations

import asyncio
from statistics import median
from typing import Any


def _percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * pct
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def _safe_median(values: list[float | None]) -> float | None:
    clean = [v for v in values if v is not None and v > 0]
    if not clean:
        return None
    return float(median(clean))


async def _peer_multiples(peer_ticker: str, market_data_fn) -> dict[str, Any]:
    """Fetch multiples for a single peer ticker."""
    try:
        md = await market_data_fn(peer_ticker)
        price = float(md.get("price") or 0)
    except Exception:
        price = 0

    loop = asyncio.get_event_loop()

    def _yf_info() -> dict[str, Any]:
        try:
            import yfinance as yf

            info = yf.Ticker(peer_ticker).info or {}
            market_cap = info.get("marketCap")
            revenue = info.get("totalRevenue")
            ebitda = info.get("ebitda")
            pe = info.get("trailingPE") or info.get("forwardPE")
            ev = info.get("enterpriseValue")
            if ev is None and market_cap is not None:
                debt = info.get("totalDebt") or 0
                cash = info.get("totalCash") or 0
                ev = float(market_cap) + float(debt) - float(cash)

            ev_rev = (float(ev) / float(revenue)) if ev and revenue and revenue > 0 else None
            ev_ebitda = (float(ev) / float(ebitda)) if ev and ebitda and ebitda > 0 else None

            return {
                "ticker": peer_ticker.upper(),
                "name": info.get("shortName") or peer_ticker,
                "ev_revenue": round(ev_rev, 2) if ev_rev else None,
                "ev_ebitda": round(ev_ebitda, 2) if ev_ebitda else None,
                "pe_ratio": round(float(pe), 2) if pe and pe > 0 else None,
                "market_cap": float(market_cap) if market_cap else None,
                "current_price": price or info.get("regularMarketPrice"),
            }
        except Exception:
            return {
                "ticker": peer_ticker.upper(),
                "name": peer_ticker,
                "ev_revenue": None,
                "ev_ebitda": None,
                "pe_ratio": None,
                "market_cap": None,
                "current_price": price or None,
            }

    return await loop.run_in_executor(None, _yf_info)


async def run_comps(
    ticker: str,
    financials: dict[str, Any],
    peers: list[dict] | None = None,
    resolve_peers_fn=None,
    market_data_fn=None,
) -> dict[str, Any]:
    """
    Compute peer multiples and implied valuation range.
    """
    from agents.tools.peer_tool import resolve_peers
    from services.market_service import get_market_data

    _resolve = resolve_peers_fn or resolve_peers
    _market = market_data_fn or get_market_data

    if peers is None:
        peers = await _resolve(ticker)

    peer_rows: list[dict[str, Any]] = []
    for p in peers[:5]:
        pt = p.get("ticker") if isinstance(p, dict) else str(p)
        if not pt:
            continue
        row = await _peer_multiples(pt, _market)
        row["name"] = p.get("name", row.get("name")) if isinstance(p, dict) else row.get("name")
        peer_rows.append(row)

    revenue = float(financials.get("revenue") or 0)
    ebitda = float(financials.get("ebitda") or 0)
    net_debt = float(financials.get("net_debt") or 0)
    shares = float(financials.get("shares_outstanding") or 1)
    price = financials.get("current_price")

    ev_rev_med = _safe_median([r.get("ev_revenue") for r in peer_rows])
    ev_ebitda_med = _safe_median([r.get("ev_ebitda") for r in peer_rows])
    pe_med = _safe_median([r.get("pe_ratio") for r in peer_rows])

    ev_rev_vals = sorted([r["ev_revenue"] for r in peer_rows if r.get("ev_revenue")])
    ev_ebitda_vals = sorted([r["ev_ebitda"] for r in peer_rows if r.get("ev_ebitda")])
    pe_vals = sorted([r["pe_ratio"] for r in peer_rows if r.get("pe_ratio")])

    implied_evs: list[float] = []
    if revenue > 0 and ev_rev_med:
        implied_evs.append(revenue * ev_rev_med)
    if ebitda > 0 and ev_ebitda_med:
        implied_evs.append(ebitda * ev_ebitda_med)

    if not implied_evs and revenue > 0:
        implied_evs.append(revenue * 3.0)

    implied_ev_mid = float(median(implied_evs)) if implied_evs else 0.0
    implied_ev_low = implied_ev_mid * 0.85
    implied_ev_high = implied_ev_mid * 1.15

    if ev_rev_vals:
        implied_ev_low = revenue * _percentile(ev_rev_vals, 0.25) if revenue > 0 else implied_ev_low
        implied_ev_high = revenue * _percentile(ev_rev_vals, 0.75) if revenue > 0 else implied_ev_high

    def ev_to_price(ev: float) -> float:
        equity = ev - net_debt
        return equity / shares if shares > 0 else 0.0

    implied_price_mid = ev_to_price(implied_ev_mid)
    implied_price_low = ev_to_price(implied_ev_low)
    implied_price_high = ev_to_price(implied_ev_high)

    if pe_med and price and shares:
        eps_proxy = float(price) / pe_med if pe_med > 0 else 0
        if eps_proxy > 0:
            pe_low = _percentile(pe_vals, 0.25) if pe_vals else pe_med * 0.85
            pe_high = _percentile(pe_vals, 0.75) if pe_vals else pe_med * 1.15
            implied_price_low = min(implied_price_low, eps_proxy * pe_low) if implied_price_low else eps_proxy * pe_low
            implied_price_high = max(implied_price_high, eps_proxy * pe_high)

    football_field = [
        {
            "label": "EV/Revenue",
            "low": round(ev_to_price(revenue * _percentile(ev_rev_vals, 0.25)) if ev_rev_vals and revenue else implied_price_low, 2),
            "mid": round(ev_to_price(revenue * ev_rev_med) if ev_rev_med and revenue else implied_price_mid, 2),
            "high": round(ev_to_price(revenue * _percentile(ev_rev_vals, 0.75)) if ev_rev_vals and revenue else implied_price_high, 2),
        },
        {
            "label": "EV/EBITDA",
            "low": round(ev_to_price(ebitda * _percentile(ev_ebitda_vals, 0.25)) if ev_ebitda_vals and ebitda else implied_price_low, 2),
            "mid": round(ev_to_price(ebitda * ev_ebitda_med) if ev_ebitda_med and ebitda else implied_price_mid, 2),
            "high": round(ev_to_price(ebitda * _percentile(ev_ebitda_vals, 0.75)) if ev_ebitda_vals and ebitda else implied_price_high, 2),
        },
        {
            "label": "Comps Blend",
            "low": round(implied_price_low, 2),
            "mid": round(implied_price_mid, 2),
            "high": round(implied_price_high, 2),
        },
    ]

    return {
        "peers": peer_rows,
        "implied_price_low": round(max(0, implied_price_low), 2),
        "implied_price_mid": round(max(0, implied_price_mid), 2),
        "implied_price_high": round(max(0, implied_price_high), 2),
        "implied_ev_low": round(implied_ev_low, 2),
        "implied_ev_mid": round(implied_ev_mid, 2),
        "implied_ev_high": round(implied_ev_high, 2),
        "football_field": football_field,
        "current_price": round(float(price), 2) if price else None,
    }
