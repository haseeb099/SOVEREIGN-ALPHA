"""Research subgraph end-to-end tests with mocked tools."""
import pytest
from unittest.mock import AsyncMock, patch

from agents.orchestrator.research_graph import run_research_pass


@pytest.mark.asyncio
async def test_research_graph_produces_brief(mock_cerebras_agent, sample_market_data, sample_scenario):
    with patch("agents.orchestrator.research_graph.fetch_and_index_edgar", AsyncMock(return_value=[])):
        with patch("agents.orchestrator.research_graph.fetch_and_index_insider", AsyncMock(return_value=[])):
            with patch("agents.orchestrator.research_graph.fetch_and_index_options", AsyncMock(return_value=[])):
                with patch("agents.orchestrator.research_graph.fetch_and_index_esg", AsyncMock(return_value=[])):
                    with patch("agents.orchestrator.research_graph.fetch_and_index_peers", AsyncMock(return_value=[])):
                        result = await run_research_pass(
                            ticker="TSLA",
                            market_data=sample_market_data,
                            scenario=sample_scenario,
                            retrieved_chunks=[],
                        )

    assert "research_brief" in result
    assert "RESEARCH_BRIEF" in result["research_brief"]
    assert len(result.get("research_traces") or []) == 6
    assert "red_team_signals" in result
