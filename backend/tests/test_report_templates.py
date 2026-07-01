"""Report template rendering tests."""
from services.report_template_service import render_report_html, VALID_TEMPLATES

SAMPLE_PAYLOAD = {
    "ticker": "TSLA",
    "memo": {
        "summary": "Test summary for export.",
        "rating": "BULLISH",
        "price_target": 220,
        "confidence_score": 7,
        "bull_verdict": "Strong growth.",
        "bear_verdict": "Competition risk.",
        "distribution": {
            "bear": {"price": 150, "probability": 0.2},
            "base": {"price": 200, "probability": 0.5},
            "bull": {"price": 280, "probability": 0.3},
        },
        "audit_warnings": ["Verify margins"],
    },
    "thesis_points": [
        {"metric": "Margins", "text": "Above 18%", "current_value": "19%", "status": "PASS"},
    ],
    "sovereign_score": 72,
}


def test_all_templates_render():
    for template in VALID_TEMPLATES:
        html = render_report_html(template, SAMPLE_PAYLOAD)
        assert "<html" in html.lower()
        assert "TSLA" in html


def test_equity_research_includes_thesis_table():
    html = render_report_html("equity_research", SAMPLE_PAYLOAD)
    assert "Thesis Tracker" in html
    assert "Above 18%" in html


def test_invalid_template_falls_back():
    html = render_report_html("unknown_template", SAMPLE_PAYLOAD)
    assert "TSLA" in html
