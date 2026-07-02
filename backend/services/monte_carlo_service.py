"""Monte Carlo simulation on DCF inputs."""
from __future__ import annotations

import os
from typing import Any

import numpy as np

from services.dcf_engine import default_dcf_assumptions, run_dcf
from services.valuation_engine import build_distribution

DEFAULT_SIMS = int(os.environ.get("VALUATION_MC_SIMS", "2000"))


def run_monte_carlo(
    financials: dict[str, Any],
    config: dict[str, Any] | None = None,
    current_price: float | None = None,
) -> dict[str, Any]:
    """Simulate DCF implied prices; return percentiles and histogram."""
    cfg = config or {}
    n_sims = int(cfg.get("simulations") or DEFAULT_SIMS)
    base = default_dcf_assumptions(financials)
    if cfg.get("base_assumptions"):
        base.update(cfg["base_assumptions"])

    wacc_mean = float(cfg.get("wacc_mean") or base["wacc"])
    wacc_std = float(cfg.get("wacc_std") or 0.015)
    growth_mean = float(cfg.get("growth_mean") or base.get("revenue_growth", 0.08))
    growth_std = float(cfg.get("growth_std") or 0.03)
    margin_mean = float(cfg.get("margin_mean") or base.get("fcf_margin", 0.12))
    margin_std = float(cfg.get("margin_std") or 0.02)

    rng = np.random.default_rng(42)
    prices: list[float] = []

    for _ in range(n_sims):
        assumptions = dict(base)
        assumptions["wacc"] = max(0.05, min(0.25, float(rng.normal(wacc_mean, wacc_std))))
        assumptions["revenue_growth"] = max(-0.15, min(0.40, float(rng.normal(growth_mean, growth_std))))
        assumptions["fcf_margin"] = max(0.01, min(0.40, float(rng.normal(margin_mean, margin_std))))
        try:
            result = run_dcf(financials, assumptions, current_price=current_price)
            p = result["implied_share_price"]
            if p > 0 and np.isfinite(p):
                prices.append(p)
        except Exception:
            continue

    if not prices:
        base_result = run_dcf(financials, base, current_price=current_price)
        p = base_result["implied_share_price"]
        prices = [p]

    arr = np.array(prices)
    p5 = float(np.percentile(arr, 5))
    p50 = float(np.percentile(arr, 50))
    p95 = float(np.percentile(arr, 95))
    mean = float(np.mean(arr))
    std = float(np.std(arr))

    hist_counts, bin_edges = np.histogram(arr, bins=20)
    histogram = [
        {
            "bin_start": round(float(bin_edges[i]), 2),
            "bin_end": round(float(bin_edges[i + 1]), 2),
            "count": int(hist_counts[i]),
        }
        for i in range(len(hist_counts))
    ]

    cp = current_price or financials.get("current_price") or p50
    distribution = build_distribution(float(cp), p50, bull_target=p95, bear_target=p5)

    return {
        "p5": round(p5, 2),
        "p50": round(p50, 2),
        "p95": round(p95, 2),
        "mean": round(mean, 2),
        "std": round(std, 2),
        "histogram": histogram,
        "simulations": len(prices),
        "distribution": distribution,
    }
