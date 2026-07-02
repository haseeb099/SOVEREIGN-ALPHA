"""Deterministic DCF engine — FCF projection, WACC discount, terminal value."""
from __future__ import annotations

from typing import Any


DEFAULT_DCF_ASSUMPTIONS: dict[str, Any] = {
    "projection_years": 5,
    "wacc": 0.10,
    "terminal_growth": 0.025,
    "fcf_margin": 0.12,
    "revenue_growth": 0.08,
    "capex_pct": 0.05,
    "nwc_pct": 0.02,
}


def default_dcf_assumptions(financials: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build default assumptions from financial snapshot."""
    assumptions = dict(DEFAULT_DCF_ASSUMPTIONS)
    if not financials:
        return assumptions

    revenue = financials.get("revenue")
    fcf = financials.get("fcf")
    if revenue and fcf and revenue > 0:
        assumptions["fcf_margin"] = round(float(fcf) / float(revenue), 4)

    beta = financials.get("beta")
    if beta is not None:
        # Simple CAPM-ish WACC adjustment
        assumptions["wacc"] = round(0.04 + float(beta) * 0.06, 4)

    return assumptions


def run_dcf(
    financials: dict[str, Any],
    assumptions: dict[str, Any] | None = None,
    current_price: float | None = None,
) -> dict[str, Any]:
    """
    Project FCF, discount at WACC, Gordon terminal value, equity bridge.
    """
    base = default_dcf_assumptions(financials)
    merged = {**base, **(assumptions or {})}

    years = int(merged["projection_years"])
    wacc = float(merged["wacc"])
    terminal_growth = float(merged["terminal_growth"])
    fcf_margin = float(merged.get("fcf_margin") or 0.12)
    revenue_growth = float(merged.get("revenue_growth") or 0.08)
    capex_pct = float(merged.get("capex_pct") or 0.05)
    nwc_pct = float(merged.get("nwc_pct") or 0.02)

    revenue = float(financials.get("revenue") or 0)
    if revenue <= 0:
        price = current_price or financials.get("current_price") or 0
        shares = float(financials.get("shares_outstanding") or 1)
        revenue = price * shares * 0.5 if price > 0 else 1_000_000_000

    shares = float(financials.get("shares_outstanding") or 1)
    net_debt = float(financials.get("net_debt") or 0)
    price = current_price if current_price is not None else financials.get("current_price")

    projections: list[dict[str, float]] = []
    pv_fcf = 0.0
    rev = revenue

    for year in range(1, years + 1):
        rev *= 1 + revenue_growth
        ebit = rev * fcf_margin
        capex = rev * capex_pct
        nwc_change = rev * nwc_pct * revenue_growth
        fcf = ebit - capex - nwc_change
        discount = (1 + wacc) ** year
        discounted = fcf / discount
        pv_fcf += discounted
        projections.append(
            {
                "year": year,
                "revenue": round(rev, 2),
                "fcf": round(fcf, 2),
                "discounted_fcf": round(discounted, 2),
            }
        )

    last_fcf = projections[-1]["fcf"] if projections else revenue * fcf_margin
    if wacc <= terminal_growth:
        terminal_growth = wacc - 0.005
    terminal_value = last_fcf * (1 + terminal_growth) / (wacc - terminal_growth)
    pv_terminal = terminal_value / ((1 + wacc) ** years)
    enterprise_value = pv_fcf + pv_terminal
    equity_value = enterprise_value - net_debt
    implied_share_price = equity_value / shares if shares > 0 else 0.0

    upside_pct = None
    if price and float(price) > 0:
        upside_pct = round((implied_share_price - float(price)) / float(price) * 100, 2)

    clean_assumptions = {
        "projection_years": years,
        "wacc": round(wacc, 4),
        "terminal_growth": round(terminal_growth, 4),
        "fcf_margin": round(fcf_margin, 4),
        "revenue_growth": round(revenue_growth, 4),
        "capex_pct": round(capex_pct, 4),
        "nwc_pct": round(nwc_pct, 4),
    }
    for key in ("agent_confidence", "agent_narrative"):
        if key in merged:
            clean_assumptions[key] = merged[key]

    return {
        "implied_share_price": round(implied_share_price, 2),
        "enterprise_value": round(enterprise_value, 2),
        "equity_value": round(equity_value, 2),
        "terminal_value": round(terminal_value, 2),
        "pv_fcf": round(pv_fcf, 2),
        "upside_pct": upside_pct,
        "current_price": round(float(price), 2) if price else None,
        "projections": projections,
        "assumptions": clean_assumptions,
    }
