"""Sovereign score service tests."""
from services.sovereign_score_service import METHODOLOGY_WEIGHTS, attach_sovereign_score, compute_sovereign_score


def test_methodology_weights_sum_to_one():
    assert abs(sum(METHODOLOGY_WEIGHTS.values()) - 1.0) < 0.001


def test_compute_returns_components():
    memo = {
        "confidence_score": 7.5,
        "audit_warnings": [],
        "distribution": {
            "bear": {"price": 165, "probability": 0.2},
            "base": {"price": 220, "probability": 0.55},
            "bull": {"price": 285, "probability": 0.25},
        },
    }
    thesis = [{"status": "PASS"}, {"status": "RISK"}]
    result = compute_sovereign_score(memo, thesis, {"change_pct": 2.0})
    assert 0 <= result["score"] <= 100
    assert result["methodology"] == METHODOLOGY_WEIGHTS
    assert "thesis_health" in result["components"]


def test_attach_always_on_analyze(sample_pipeline_result, sample_market_data):
    result = attach_sovereign_score(dict(sample_pipeline_result), sample_market_data)
    assert "sovereign_score" in result
    assert isinstance(result["sovereign_score"], (int, float))
    assert "sovereign_score_detail" in result
    assert "methodology" in result["sovereign_score_detail"]
