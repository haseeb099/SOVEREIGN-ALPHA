"""Portfolio-style risk metrics from OHLCV history."""
from __future__ import annotations

import os
from typing import Any

import numpy as np

RISK_FREE_RATE = float(os.environ.get("RISK_FREE_RATE", "0"))


def _closes(bars: list[dict[str, Any]]) -> np.ndarray:
    return np.array(
        [float(b.get("close") or b.get("c") or 0) for b in bars],
        dtype=np.float64,
    )


def daily_returns(closes: np.ndarray) -> np.ndarray:
    """Simple daily log returns."""
    if len(closes) < 2:
        return np.array([], dtype=np.float64)
    with np.errstate(divide="ignore", invalid="ignore"):
        rets = np.diff(np.log(closes))
    return rets[np.isfinite(rets)]


def sharpe_ratio(returns: np.ndarray, risk_free_annual: float = RISK_FREE_RATE) -> float | None:
    """Annualized Sharpe ratio (rf assumed annual, converted to daily)."""
    if len(returns) < 2:
        return None
    rf_daily = risk_free_annual / 252.0
    excess = returns - rf_daily
    std = np.std(excess, ddof=1)
    if std == 0 or not np.isfinite(std):
        return None
    return round(float(np.mean(excess) / std * np.sqrt(252)), 4)


def max_drawdown(closes: np.ndarray) -> float | None:
    """Peak-to-trough max drawdown as a negative fraction (e.g. -0.25 = -25%)."""
    if len(closes) < 2:
        return None
    running_max = np.maximum.accumulate(closes)
    drawdowns = (closes - running_max) / running_max
    return round(float(np.min(drawdowns)), 4)


def var_95(returns: np.ndarray) -> float | None:
    """Historical 1-day VaR at 95% (5th percentile of daily returns)."""
    if len(returns) < 5:
        return None
    return round(float(np.percentile(returns, 5)), 6)


def beta(returns: np.ndarray, benchmark_returns: np.ndarray) -> float | None:
    """Beta vs benchmark using aligned daily returns."""
    n = min(len(returns), len(benchmark_returns))
    if n < 5:
        return None
    r = returns[-n:]
    b = benchmark_returns[-n:]
    cov = np.cov(r, b, ddof=1)
    if cov.shape != (2, 2):
        return None
    var_b = cov[1, 1]
    if var_b == 0 or not np.isfinite(var_b):
        return None
    return round(float(cov[0, 1] / var_b), 4)


def compute_risk_metrics(
    bars: list[dict[str, Any]],
    benchmark_bars: list[dict[str, Any]] | None = None,
    risk_free_rate: float | None = None,
) -> dict[str, Any]:
    """
    Compute Sharpe, max drawdown, VaR 95%, and beta from OHLCV bars.
    """
    rf = risk_free_rate if risk_free_rate is not None else RISK_FREE_RATE
    closes = _closes(bars)
    if len(closes) < 2:
        return {
            "sharpe_ratio": None,
            "max_drawdown": None,
            "var_95": None,
            "beta": None,
            "observations": 0,
            "risk_free_rate": rf,
        }

    rets = daily_returns(closes)
    bench_rets = daily_returns(_closes(benchmark_bars)) if benchmark_bars else None

    return {
        "sharpe_ratio": sharpe_ratio(rets, rf),
        "max_drawdown": max_drawdown(closes),
        "var_95": var_95(rets),
        "beta": beta(rets, bench_rets) if bench_rets is not None and len(bench_rets) > 0 else None,
        "observations": len(rets),
        "risk_free_rate": rf,
    }
