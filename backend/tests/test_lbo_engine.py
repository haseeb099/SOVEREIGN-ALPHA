"""Unit tests for lbo_engine."""
from services.lbo_engine import default_lbo_assumptions, run_lbo


FINANCIALS = {
    "revenue": 500_000_000,
    "ebitda": 100_000_000,
}


def test_lbo_irr_moic_sanity():
    result = run_lbo(FINANCIALS)
    assert result["moic"] > 0
    assert -50 < result["irr"] < 100


def test_lbo_higher_exit_multiple_raises_moic():
    base = run_lbo(FINANCIALS, {"exit_multiple": 10})
    higher = run_lbo(FINANCIALS, {"exit_multiple": 14})
    assert higher["moic"] >= base["moic"]


def test_default_lbo_margin_from_financials():
    assumptions = default_lbo_assumptions(FINANCIALS)
    assert assumptions["ebitda_margin"] == 0.2
