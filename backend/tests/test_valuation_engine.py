"""Unit tests for valuation consistency engine."""
import pytest

from services.valuation_engine import (
    apply_to_memo,
    build_distribution,
    consistency_checks,
    enforce_valuation_consistency,
    scenario_preview,
)


def test_bear_lte_target_lte_bull_passes():
    distribution = build_distribution(200.0, 220.0, bull_target=285.0, bear_target=165.0)
    warnings = consistency_checks(220.0, distribution)
    assert warnings == []


def test_target_outside_range_flags_warning():
    distribution = build_distribution(200.0, 220.0, bull_target=285.0, bear_target=165.0)
    warnings = consistency_checks(300.0, distribution)
    assert any("outside bear/bull range" in w for w in warnings)


def test_probability_sum_mismatch_flags_warning():
    distribution = build_distribution(200.0, 220.0)
    distribution["bear"]["probability"] = 0.30
    distribution["bull"]["probability"] = 0.30
    warnings = consistency_checks(220.0, distribution)
    assert any("probabilities sum" in w for w in warnings)


def test_enforce_clamps_target_above_bull():
    dist = build_distribution(200.0, 220.0, bull_target=250.0, bear_target=165.0)
    target, fixed, repairs = enforce_valuation_consistency(300.0, dist, 200.0)
    assert fixed["bear"]["price"] <= target <= fixed["bull"]["price"]
    assert target <= fixed["bull"]["price"]
    assert repairs


def test_apply_to_memo_adds_distribution():
    memo = {
        "bull_verdict": "Bull",
        "bear_verdict": "Bear",
        "summary": "Summary",
        "price_target": 220.0,
        "confidence_band": [185, 270],
        "rating": "BULLISH",
        "confidence_score": 7.5,
        "audit_warnings": [],
    }
    bull = {"price_target": 285.0}
    red_team = {"bear_price_target": 165.0}

    result = apply_to_memo(memo, current_price=200.0, bull_agent=bull, red_team_agent=red_team)
    assert "distribution" in result
    assert result["distribution"]["bear"]["price"] <= result["price_target"] <= result["distribution"]["bull"]["price"]


def test_apply_to_memo_repairs_contradictory_synthesis():
    memo = {
        "bull_verdict": "Bull",
        "bear_verdict": "Bear",
        "summary": "Summary",
        "price_target": 350.0,
        "confidence_band": [300, 400],
        "rating": "BULLISH",
        "confidence_score": 7.5,
        "audit_warnings": [],
        "distribution": {
            "bear": {"price": 165.0, "probability": 0.20},
            "base": {"price": 210.0, "probability": 0.55},
            "bull": {"price": 285.0, "probability": 0.25},
        },
    }
    result = apply_to_memo(memo, current_price=200.0)
    assert result["distribution"]["bear"]["price"] <= result["price_target"] <= result["distribution"]["bull"]["price"]


def test_scenario_preview_returns_delta():
    result = scenario_preview(
        "TSLA",
        current_price=200.0,
        scenario={"margins": 22.0, "rates": 3.0, "regulatory": "Low", "sentiment": "Bullish"},
        base={"memo": {"price_target": 220.0, "confidence_score": 7.0}},
    )
    assert "price_target" in result
    assert "deltas" in result
    assert "distribution" in result
    assert result["distribution"]["bear"]["price"] <= result["price_target"] <= result["distribution"]["bull"]["price"]
