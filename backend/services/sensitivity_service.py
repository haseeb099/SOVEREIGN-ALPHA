"""Financial sensitivity grids — WACC × terminal growth, margin × growth."""
from __future__ import annotations

from typing import Any

from services.dcf_engine import default_dcf_assumptions, run_dcf


def build_sensitivity_grid(
    financials: dict[str, Any],
    assumptions: dict[str, Any] | None = None,
    row_axis: str = "wacc",
    col_axis: str = "terminal_growth",
    row_steps: int = 5,
    col_steps: int = 5,
    current_price: float | None = None,
) -> dict[str, Any]:
    """Generate 2D implied-price grid from base assumptions."""
    base = default_dcf_assumptions(financials)
    base.update(assumptions or {})

    if row_axis == "wacc" and col_axis == "terminal_growth":
        wacc_base = float(base["wacc"])
        tg_base = float(base["terminal_growth"])
        row_values = [round(wacc_base + (i - row_steps // 2) * 0.01, 4) for i in range(row_steps)]
        col_values = [round(tg_base + (j - col_steps // 2) * 0.005, 4) for j in range(col_steps)]
    elif row_axis == "fcf_margin" and col_axis == "revenue_growth":
        margin_base = float(base.get("fcf_margin") or 0.12)
        growth_base = float(base.get("revenue_growth") or 0.08)
        row_values = [round(max(0.02, margin_base + (i - row_steps // 2) * 0.02), 4) for i in range(row_steps)]
        col_values = [round(growth_base + (j - col_steps // 2) * 0.02, 4) for j in range(col_steps)]
    else:
        wacc_base = float(base["wacc"])
        tg_base = float(base["terminal_growth"])
        row_values = [round(wacc_base + (i - row_steps // 2) * 0.01, 4) for i in range(row_steps)]
        col_values = [round(tg_base + (j - col_steps // 2) * 0.005, 4) for j in range(col_steps)]
        row_axis = "wacc"
        col_axis = "terminal_growth"

    cells: list[list[float]] = []
    base_row_idx = row_steps // 2
    base_col_idx = col_steps // 2

    for rv in row_values:
        row_cells: list[float] = []
        for cv in col_values:
            trial = dict(base)
            trial[row_axis] = rv
            trial[col_axis] = cv
            if row_axis == "wacc":
                trial["wacc"] = max(0.05, rv)
            wacc_val = float(trial.get("wacc") or base.get("wacc") or 0.10)
            if col_axis == "terminal_growth":
                trial["terminal_growth"] = min(cv, wacc_val - 0.005)
            try:
                result = run_dcf(financials, trial, current_price=current_price)
                row_cells.append(result["implied_share_price"])
            except Exception:
                row_cells.append(0.0)
        cells.append(row_cells)

    return {
        "row_axis": row_axis,
        "col_axis": col_axis,
        "row_values": row_values,
        "col_values": col_values,
        "cells": cells,
        "base_row": base_row_idx,
        "base_col": base_col_idx,
    }


def parse_nl_financial_scenario(text: str) -> dict[str, Any]:
    """Rule-based NL parser for financial assumptions (fast fallback)."""
    lower = text.lower()
    assumptions: dict[str, Any] = {}
    explanation: list[str] = []

    if "wacc" in lower or "discount rate" in lower or "rates rise" in lower or "rate hike" in lower:
        if "100bp" in lower or "100 bps" in lower or "1%" in lower:
            assumptions["wacc"] = 0.11
            explanation.append("Rates +100bps → WACC elevated to 11%")
        elif "200bp" in lower or "200 bps" in lower or "2%" in lower:
            assumptions["wacc"] = 0.12
            explanation.append("Rates +200bps → WACC elevated to 12%")
        else:
            assumptions["wacc"] = 0.105
            explanation.append("Rate pressure → WACC modestly higher")

    if "margin" in lower and ("compress" in lower or "decline" in lower or "lower" in lower):
        bps = 300 if "300" in lower else 200 if "200" in lower else 100
        assumptions["fcf_margin"] = max(0.02, 0.12 - bps / 10000)
        explanation.append(f"Margin compression {bps}bps applied to FCF margin")

    if "growth" in lower and ("slow" in lower or "decline" in lower or "lower" in lower):
        assumptions["revenue_growth"] = 0.04
        explanation.append("Growth slowdown → revenue growth reduced to 4%")
    elif "growth" in lower and ("acceler" in lower or "higher" in lower):
        assumptions["revenue_growth"] = 0.12
        explanation.append("Growth acceleration → revenue growth raised to 12%")

    if "terminal" in lower and "growth" in lower:
        if "lower" in lower or "cut" in lower:
            assumptions["terminal_growth"] = 0.015
            explanation.append("Terminal growth cut to 1.5%")
        elif "higher" in lower or "raise" in lower:
            assumptions["terminal_growth"] = 0.035
            explanation.append("Terminal growth raised to 3.5%")

    if not assumptions:
        assumptions["revenue_growth"] = 0.06
        explanation.append("Neutral financial scenario — modest growth assumption")

    return {
        "parsed_assumptions": assumptions,
        "explanation": "; ".join(explanation),
        "raw": text,
    }
