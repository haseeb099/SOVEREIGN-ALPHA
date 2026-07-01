"""LangGraph analysis subgraph schema tests."""
import pytest

from agents.orchestrator.graph import run_analysis_subgraph
from tests.conftest import MEMO_SCHEMA_KEYS, PIPELINE_SCHEMA_KEYS


@pytest.mark.asyncio
async def test_analysis_subgraph_schema_keys(
    mock_cerebras_agent,
    sample_market_data,
    sample_scenario,
):
    result = await run_analysis_subgraph(
        ticker="TSLA",
        market_data=sample_market_data,
        scenario=sample_scenario,
    )
    assert set(PIPELINE_SCHEMA_KEYS).issubset(set(result.keys()))
    assert set(MEMO_SCHEMA_KEYS).issubset(set(result["memo"].keys()))
    assert result["ticker"] == "TSLA"
    assert len(result.get("agent_traces") or []) == 5
    assert result["memo"]["rating"] == "BULLISH"
