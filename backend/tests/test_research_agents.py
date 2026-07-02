"""Research agent JSON schema tests."""
import pytest

from agents.orchestrator.state import AnalysisState


def _base_state() -> AnalysisState:
    return {
        "ticker": "TSLA",
        "market_data": {"price": 185.0, "change_pct": 1.0, "volatility_30d": 30.0, "full_name": "Tesla"},
        "scenario": {"margins": 18.5, "rates": 4.5, "regulatory": "Low", "sentiment": "Neutral"},
        "retrieved_chunks": [{"chunk_id": "c1", "source_type": "market", "source_label": "x", "chunk_text": "data"}],
        "retrieved_sources": "RETRIEVED_SOURCES: test",
        "context": "Analyze TSLA",
        "client": object(),
        "valid_chunk_ids": {"c1"},
        "has_market": True,
        "on_log": None,
        "research_results": {},
        "pipeline_audit": [],
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "module_name,result_key",
    [
        ("company_research_agent", "company_research"),
        ("sector_macro_research_agent", "sector_macro"),
        ("competitive_analysis_agent", "competitive"),
        ("esg_compliance_agent", "esg"),
        ("insider_sentiment_agent", "insider"),
        ("options_flow_agent", "options_flow"),
    ],
)
async def test_research_agent_returns_json(mock_cerebras_agent, module_name, result_key):
    import importlib

    mod = importlib.import_module(f"agents.{module_name}")
    state = _base_state()
    patch = await mod.run(state)
    results = patch.get("research_results") or {}
    assert result_key in results
    assert "error" not in results[result_key]
    assert results[result_key].get("log_message")
