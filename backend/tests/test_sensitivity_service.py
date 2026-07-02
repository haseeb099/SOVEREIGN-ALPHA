"""Unit tests for sensitivity_service."""
import pytest

from services.dcf_engine import run_dcf
from services.sensitivity_service import build_sensitivity_grid, parse_nl_financial_scenario


FINANCIALS = {
    "revenue": 1_000_000_000,
    "fcf": 120_000_000,
    "net_debt": 200_000_000,
    "shares_outstanding": 10_000_000,
    "current_price": 200,
}


def test_sensitivity_grid_dimensions():
    grid = build_sensitivity_grid(FINANCIALS, row_steps=5, col_steps=5)
    assert len(grid["row_values"]) == 5
    assert len(grid["col_values"]) == 5
    assert len(grid["cells"]) == 5
    assert len(grid["cells"][0]) == 5


def test_sensitivity_center_matches_base_case():
    assumptions = {"wacc": 0.10, "terminal_growth": 0.025, "projection_years": 5}
    grid = build_sensitivity_grid(FINANCIALS, assumptions, row_steps=5, col_steps=5)
    base = run_dcf(FINANCIALS, assumptions, current_price=200)
    br = grid["base_row"]
    bc = grid["base_col"]
    assert grid["cells"][br][bc] == pytest.approx(base["implied_share_price"], rel=0.01)


def test_parse_nl_financial_margin_compression():
    parsed = parse_nl_financial_scenario("What if margins compress 300bps and rates rise 100bps?")
    assert "parsed_assumptions" in parsed
    assert parsed["parsed_assumptions"].get("fcf_margin") is not None
    assert "explanation" in parsed
