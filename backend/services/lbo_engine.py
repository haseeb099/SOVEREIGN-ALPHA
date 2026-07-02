"""LBO modeling scaffold — IRR and MOIC."""
from __future__ import annotations

from typing import Any


DEFAULT_LBO_ASSUMPTIONS: dict[str, Any] = {
    "entry_multiple": 10.0,
    "exit_multiple": 11.0,
    "leverage_pct": 0.60,
    "hold_years": 5,
    "interest_rate": 0.07,
    "revenue_growth": 0.05,
    "ebitda_margin": 0.20,
}


def default_lbo_assumptions(financials: dict[str, Any] | None = None) -> dict[str, Any]:
    assumptions = dict(DEFAULT_LBO_ASSUMPTIONS)
    if not financials:
        return assumptions
    revenue = financials.get("revenue")
    ebitda = financials.get("ebitda")
    if revenue and ebitda and float(revenue) > 0:
        assumptions["ebitda_margin"] = round(float(ebitda) / float(revenue), 4)
    return assumptions


def run_lbo(
    financials: dict[str, Any],
    assumptions: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """PE-style LBO: entry EV, debt paydown, exit EV → IRR/MOIC."""
    base = default_lbo_assumptions(financials)
    merged = {**base, **(assumptions or {})}

    entry_mult = float(merged["entry_multiple"])
    exit_mult = float(merged["exit_multiple"])
    leverage = float(merged["leverage_pct"])
    hold_years = int(merged["hold_years"])
    interest_rate = float(merged.get("interest_rate") or 0.07)
    revenue_growth = float(merged.get("revenue_growth") or 0.05)
    ebitda_margin = float(merged.get("ebitda_margin") or 0.20)

    revenue = float(financials.get("revenue") or 0)
    ebitda = float(financials.get("ebitda") or 0)
    if ebitda <= 0 and revenue > 0:
        ebitda = revenue * ebitda_margin
    elif ebitda <= 0:
        ebitda = 100_000_000

    entry_ev = ebitda * entry_mult
    debt = entry_ev * leverage
    equity_invested = entry_ev - debt

    # Simple debt paydown from FCF
    exit_ebitda = ebitda
    remaining_debt = debt
    for _ in range(hold_years):
        exit_ebitda *= 1 + revenue_growth
        fcf = exit_ebitda * 0.5  # simplified FCF conversion
        interest = remaining_debt * interest_rate
        principal = max(0, fcf - interest)
        remaining_debt = max(0, remaining_debt - principal)

    exit_ev = exit_ebitda * exit_mult
    equity_proceeds = exit_ev - remaining_debt

    moic = equity_proceeds / equity_invested if equity_invested > 0 else 0.0
    irr = (moic ** (1 / hold_years) - 1) if moic > 0 and hold_years > 0 else 0.0

    clean = {
        "entry_multiple": round(entry_mult, 2),
        "exit_multiple": round(exit_mult, 2),
        "leverage_pct": round(leverage, 4),
        "hold_years": hold_years,
        "interest_rate": round(interest_rate, 4),
        "revenue_growth": round(revenue_growth, 4),
        "ebitda_margin": round(ebitda_margin, 4),
    }

    return {
        "irr": round(irr * 100, 2),
        "moic": round(moic, 2),
        "entry_ev": round(entry_ev, 2),
        "exit_ev": round(exit_ev, 2),
        "equity_invested": round(equity_invested, 2),
        "equity_proceeds": round(equity_proceeds, 2),
        "assumptions": clean,
    }
