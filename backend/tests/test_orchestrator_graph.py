"""LangGraph analysis subgraph schema tests."""
import pytest
from unittest.mock import AsyncMock

from agents.orchestrator.graph import run_analysis_subgraph
from tests.conftest import MEMO_SCHEMA_KEYS, PIPELINE_SCHEMA_KEYS


@pytest.mark.asyncio
async def test_analysis_subgraph_schema_keys(
    mock_cerebras_agent,
    sample_market_data,
    sample_scenario,
    monkeypatch,
):
    monkeypatch.setattr(
        "agents.orchestrator.research_graph.run_research_pass",
        AsyncMock(
            return_value={
                "research_brief": "RESEARCH_BRIEF:\n- test",
                "research_results": {"company_research": {"log_message": "ok", "confidence": 7}},
                "research_traces": [
                    {
                        "agent": name,
                        "confidence": 7.0,
                        "insufficient_data": False,
                        "citations": [],
                        "log_message": "ok",
                    }
                    for name in (
                        "COMPANY_RESEARCH",
                        "SECTOR_MACRO",
                        "COMPETITIVE",
                        "ESG",
                        "INSIDER",
                        "OPTIONS_FLOW",
                    )
                ],
                "red_team_signals": {},
                "retrieved_chunks": [],
                "retrieved_sources": "RETRIEVED_SOURCES: (none)",
                "pipeline_audit": [],
            }
        ),
    )
    result = await run_analysis_subgraph(
        ticker="TSLA",
        market_data=sample_market_data,
        scenario=sample_scenario,
        enable_research=True,
    )
    assert result.get("research_brief")
    assert result["memo"]["rating"] == "BULLISH"


@pytest.mark.asyncio
async def test_analysis_subgraph_without_research_has_five_traces(
    mock_cerebras_agent,
    sample_market_data,
    sample_scenario,
):
    result = await run_analysis_subgraph(
        ticker="TSLA",
        market_data=sample_market_data,
        scenario=sample_scenario,
        enable_research=False,
    )
    assert len(result.get("agent_traces") or []) == 5


@pytest.mark.asyncio
async def test_research_precedes_fundamental(mock_cerebras_agent, sample_market_data, sample_scenario, monkeypatch):
    from agents.orchestrator import graph as graph_mod

    graph_mod._analysis_graph = None
    call_order: list[str] = []
    orig_research = graph_mod._run_research_wrapper
    orig_fundamental = graph_mod._fundamental_wrapper

    async def track_research(state):
        call_order.append("research")
        return await orig_research(state)

    async def track_fundamental(state):
        call_order.append("fundamental")
        return await orig_fundamental(state)

    monkeypatch.setattr(graph_mod, "_run_research_wrapper", track_research)
    monkeypatch.setattr(graph_mod, "_fundamental_wrapper", track_fundamental)
    monkeypatch.setattr(
        "agents.orchestrator.research_graph.run_research_pass",
        AsyncMock(return_value={"research_brief": "RESEARCH_BRIEF:", "research_results": {}, "research_traces": []}),
    )

    await run_analysis_subgraph(
        ticker="TSLA",
        market_data=sample_market_data,
        scenario=sample_scenario,
        enable_research=True,
    )
    assert call_order[:2] == ["research", "fundamental"]
