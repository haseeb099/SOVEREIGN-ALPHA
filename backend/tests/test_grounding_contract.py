"""Grounding contract tests — citations and chunk_id resolution."""
import pytest

from services.retrieval_service import chunk_id_exists


def _sample_traces():
    return [
        {
            "agent": "FUNDAMENTAL",
            "confidence": 7.0,
            "insufficient_data": False,
            "citations": [
                {
                    "chunk_id": "market-TSLA",
                    "source_type": "market",
                    "source_label": "Polygon live quote",
                    "source_date": "2026-06-30",
                    "data_point": "TSLA $185.20",
                }
            ],
            "log_message": "Fundamental complete",
        },
        {
            "agent": "SYNTHESIS",
            "confidence": 7.5,
            "insufficient_data": False,
            "citations": [
                {
                    "chunk_id": "market-TSLA",
                    "source_type": "market",
                    "source_label": "Polygon live quote",
                    "source_date": "2026-06-30",
                    "data_point": "Balanced upside",
                }
            ],
            "log_message": "Synthesis complete",
        },
    ]


def test_agent_traces_require_citations(sample_pipeline_result):
    traces = sample_pipeline_result.get("agent_traces") or _sample_traces()
    for trace in traces:
        citations = trace.get("citations") or []
        assert len(citations) >= 1, f"{trace.get('agent')} missing citations"
        for cite in citations:
            assert cite.get("source_type"), "citation missing source_type"
            assert cite.get("source_label"), "citation missing source_label"
            assert cite.get("source_date"), "citation missing source_date"
            assert cite.get("data_point"), "citation missing data_point"


@pytest.mark.asyncio
async def test_market_chunk_ids_resolve():
    assert await chunk_id_exists("market-TSLA") is True


@pytest.mark.asyncio
async def test_pipeline_output_has_grounded_traces(
    mock_cerebras_agent,
    sample_market_data,
    sample_scenario,
    monkeypatch,
):
    from agents.pipeline import run_analysis_pipeline
    from services.retrieval_service import index_market_snapshot, retrieve
    from unittest.mock import AsyncMock

    monkeypatch.setattr(
        "agents.orchestrator.research_graph.run_research_pass",
        AsyncMock(
            return_value={
                "research_brief": "RESEARCH_BRIEF:",
                "research_results": {},
                "research_traces": [],
                "red_team_signals": {},
                "retrieved_chunks": [],
                "pipeline_audit": [],
            }
        ),
    )

    await index_market_snapshot("TSLA", sample_market_data)
    chunks = await retrieve(
        ticker="TSLA",
        query="investment thesis TSLA",
    )
    result = await run_analysis_pipeline(
        ticker="TSLA",
        market_data=sample_market_data,
        scenario=sample_scenario,
        retrieved_chunks=chunks,
        enable_research=True,
    )
    traces = result.get("agent_traces") or []
    assert len(traces) == 5
    for trace in traces:
        assert trace.get("confidence") is not None
        assert len(trace.get("citations") or []) >= 1


def test_consistency_service_flags_insufficient(sample_pipeline_result, sample_market_data):
    from services.consistency_service import run_consistency_checks

    payload = dict(sample_pipeline_result)
    payload["asset_price"] = 0
    warnings = run_consistency_checks(payload, retrieved_chunks=[])
    assert any("Insufficient" in w for w in warnings)
