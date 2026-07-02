"""Portfolio-level risk aggregation — VaR, CVaR, stress scenarios."""
from __future__ import annotations

from typing import Any

import numpy as np

from services.market_service import get_history
from services.risk_metrics_service import daily_returns, var_95


PREDEFINED_STRESS = [
    {"id": "market_crash", "label": "Market −20%", "shock_pct": -0.20},
    {"id": "rate_shock", "label": "Rates +200bps", "shock_pct": -0.08},
    {"id": "single_name", "label": "Largest holding −30%", "shock_pct": -0.30, "single_name": True},
]


async def compute_portfolio_risk(
    holdings: list[dict[str, Any]],
    custom_shocks: list[dict[str, Any]] | None = None,
    range_key: str = "1y",
) -> dict[str, Any]:
    """Weighted portfolio VaR, CVaR, and stress scenarios."""
    if not holdings:
        return {
            "portfolio_var_95": None,
            "portfolio_var_99": None,
            "portfolio_cvar_95": None,
            "max_stress_loss_pct": None,
            "stress_scenarios": [],
            "holding_contributions": [],
            "total_value": 0,
            "observations": 0,
        }

    enriched: list[dict[str, Any]] = []
    total_value = 0.0
    returns_matrix: list[np.ndarray] = []
    min_len = 999999

    for h in holdings:
        ticker = h["ticker"].upper()
        shares = float(h.get("shares") or 0)
        price = float(h.get("current_price") or h.get("cost_basis", 0) / shares if shares else 0)
        mv = shares * price
        total_value += mv

        bars = await get_history(ticker, range_key)
        closes = np.array([float(b.get("close") or 0) for b in bars], dtype=np.float64)
        rets = daily_returns(closes)
        if len(rets) > 0:
            min_len = min(min_len, len(rets))
            returns_matrix.append(rets)

        enriched.append({
            "ticker": ticker,
            "weight_pct": 0.0,
            "market_value": mv,
            "returns": rets,
        })

    if total_value > 0:
        for item in enriched:
            item["weight_pct"] = round(item["market_value"] / total_value * 100, 2)

    portfolio_var_95 = None
    portfolio_var_99 = None
    portfolio_cvar_95 = None
    observations = 0

    if returns_matrix and min_len < 999999 and min_len >= 5:
        aligned = np.array([r[-min_len:] for r in returns_matrix])
        weights = np.array([e["weight_pct"] / 100 for e in enriched[: len(aligned)]])
        if weights.sum() > 0:
            weights = weights / weights.sum()
        port_rets = weights @ aligned
        observations = len(port_rets)
        portfolio_var_95 = round(float(np.percentile(port_rets, 5)), 6)
        portfolio_var_99 = round(float(np.percentile(port_rets, 1)), 6)
        tail = port_rets[port_rets <= np.percentile(port_rets, 5)]
        portfolio_cvar_95 = round(float(np.mean(tail)), 6) if len(tail) > 0 else portfolio_var_95

    holding_contributions: list[dict[str, Any]] = []
    for item in enriched:
        rets = item.get("returns")
        h_var = var_95(rets) if isinstance(rets, np.ndarray) and len(rets) >= 5 else None
        holding_contributions.append({
            "ticker": item["ticker"],
            "weight_pct": item["weight_pct"],
            "var_contribution": round(h_var * item["weight_pct"] / 100, 6) if h_var is not None else None,
            "stress_loss_pct": None,
        })

    shocks = list(PREDEFINED_STRESS)
    if custom_shocks:
        shocks.extend(custom_shocks)

    stress_scenarios: list[dict[str, Any]] = []
    max_stress = 0.0
    largest = max(enriched, key=lambda x: x["weight_pct"]) if enriched else None

    for shock in shocks:
        shock_pct = float(shock.get("shock_pct", -0.10))
        if shock.get("single_name") and largest:
            loss = shock_pct * largest["weight_pct"] / 100
            label = f"{largest['ticker']} −30%"
            for hc in holding_contributions:
                if hc["ticker"] == largest["ticker"]:
                    hc["stress_loss_pct"] = round(shock_pct * 100, 2)
        else:
            loss = shock_pct  # portfolio-level
            label = shock.get("label", shock.get("id", "Custom"))

        loss_pct = round(loss * 100, 2)
        stress_scenarios.append({
            "id": shock.get("id", "custom"),
            "label": label,
            "portfolio_loss_pct": loss_pct,
            "description": shock.get("description"),
        })
        max_stress = min(max_stress, loss_pct)

    return {
        "portfolio_var_95": portfolio_var_95,
        "portfolio_var_99": portfolio_var_99,
        "portfolio_cvar_95": portfolio_cvar_95,
        "max_stress_loss_pct": round(max_stress, 2) if stress_scenarios else None,
        "stress_scenarios": stress_scenarios,
        "holding_contributions": holding_contributions,
        "total_value": round(total_value, 2),
        "observations": observations,
    }
