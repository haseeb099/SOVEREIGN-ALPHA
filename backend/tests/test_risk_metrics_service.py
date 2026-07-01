"""Unit tests for risk_metrics_service."""
import numpy as np
import pytest

from services.risk_metrics_service import (
    beta,
    compute_risk_metrics,
    daily_returns,
    max_drawdown,
    sharpe_ratio,
    var_95,
)


def _trending_bars(n: int = 100, start: float = 100.0) -> list[dict]:
    bars = []
    price = start
    for i in range(n):
        price *= 1.001 if i % 3 != 0 else 0.998
        bars.append({"date": f"2026-01-{(i % 28) + 1:02d}", "close": round(price, 4)})
    return bars


def test_daily_returns_length():
    closes = np.array([100.0, 101.0, 102.0, 101.5])
    rets = daily_returns(closes)
    assert len(rets) == 3


def test_max_drawdown_negative():
    closes = np.array([100.0, 110.0, 90.0, 95.0])
    dd = max_drawdown(closes)
    assert dd is not None
    assert dd < 0


def test_var_95_is_percentile():
    rets = np.array([0.01, -0.02, 0.005, -0.03, 0.002, -0.01, 0.004])
    var = var_95(rets)
    assert var is not None
    assert var == pytest.approx(float(np.percentile(rets, 5)), rel=1e-6)


def test_sharpe_ratio_positive_for_upward_drift():
    rets = np.array([0.001 + 0.0001 * (i % 5) for i in range(50)])
    sharpe = sharpe_ratio(rets, risk_free_annual=0.0)
    assert sharpe is not None
    assert sharpe > 0


def test_beta_near_one_for_identical_returns():
    rets = np.array([0.01, -0.005, 0.002, -0.003, 0.004, 0.001])
    b = beta(rets, rets)
    assert b == pytest.approx(1.0, rel=1e-3)


def test_compute_risk_metrics_shape():
    bars = _trending_bars()
    bench = _trending_bars(start=400.0)
    result = compute_risk_metrics(bars, bench, risk_free_rate=0.0)
    assert "sharpe_ratio" in result
    assert "max_drawdown" in result
    assert "var_95" in result
    assert "beta" in result
    assert result["observations"] > 0
    assert result["max_drawdown"] is not None


def test_compute_risk_metrics_insufficient_data():
    result = compute_risk_metrics([{"close": 100.0}])
    assert result["sharpe_ratio"] is None
    assert result["observations"] == 0
