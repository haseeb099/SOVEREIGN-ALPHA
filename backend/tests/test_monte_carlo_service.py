"""Unit tests for monte_carlo_service."""
from services.monte_carlo_service import run_monte_carlo


FINANCIALS = {
    "revenue": 1_000_000_000,
    "fcf": 120_000_000,
    "net_debt": 200_000_000,
    "shares_outstanding": 10_000_000,
    "current_price": 200,
}


def test_monte_carlo_percentile_ordering():
    result = run_monte_carlo(FINANCIALS, {"simulations": 500}, current_price=200)
    assert result["p5"] <= result["p50"] <= result["p95"]


def test_monte_carlo_histogram_bins():
    result = run_monte_carlo(FINANCIALS, {"simulations": 200})
    assert len(result["histogram"]) == 20
    assert result["simulations"] > 0


def test_monte_carlo_distribution_shape():
    result = run_monte_carlo(FINANCIALS, {"simulations": 200})
    dist = result["distribution"]
    assert "bear" in dist and "base" in dist and "bull" in dist
