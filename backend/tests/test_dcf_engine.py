"""Unit tests for dcf_engine."""
import pytest

from services.dcf_engine import default_dcf_assumptions, run_dcf


FINANCIALS = {
    "ticker": "TSLA",
    "revenue": 1_000_000_000,
    "fcf": 120_000_000,
    "net_debt": 200_000_000,
    "shares_outstanding": 10_000_000,
    "current_price": 200,
}


def test_dcf_implied_price_positive():
    result = run_dcf(FINANCIALS, current_price=200)
    assert result["implied_share_price"] > 0
    assert result["enterprise_value"] > result["equity_value"] or FINANCIALS["net_debt"] == 0


def test_wacc_up_price_down():
    low_wacc = run_dcf(FINANCIALS, {"wacc": 0.08}, current_price=200)
    high_wacc = run_dcf(FINANCIALS, {"wacc": 0.14}, current_price=200)
    assert high_wacc["implied_share_price"] < low_wacc["implied_share_price"]


def test_default_assumptions_from_fcf_margin():
    assumptions = default_dcf_assumptions(FINANCIALS)
    assert assumptions["fcf_margin"] == pytest.approx(0.12, rel=1e-3)


def test_dcf_projections_length():
    result = run_dcf(FINANCIALS, {"projection_years": 5})
    assert len(result["projections"]) == 5
