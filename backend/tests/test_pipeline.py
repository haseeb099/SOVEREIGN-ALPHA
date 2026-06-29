"""Unit tests for the 5-agent analysis pipeline."""
from unittest.mock import AsyncMock

import pytest

from agents.pipeline import run_analysis_pipeline
from tests.conftest import ANALYZE_SCHEMA_KEYS, MEMO_SCHEMA_KEYS


@pytest.mark.asyncio
async def test_pipeline_with_mocked_cerebras(
    mock_cerebras_agent,
    sample_market_data,
    sample_scenario,
):
    logs = []

    async def on_log(event):
        logs.append(event)

    result = await run_analysis_pipeline(
        ticker="TSLA",
        market_data=sample_market_data,
        scenario=sample_scenario,
        on_log=on_log,
    )

    assert set(result.keys()) == ANALYZE_SCHEMA_KEYS
    assert set(result["memo"].keys()) == MEMO_SCHEMA_KEYS
    assert result["memo"]["rating"] == "BULLISH"
    assert result["pipeline_elapsed_seconds"] >= 0
    assert len(logs) >= 5
    assert any(e["agent"] == "FUNDAMENTAL" for e in logs)


@pytest.mark.asyncio
async def test_pipeline_without_api_key_raises(monkeypatch, sample_market_data, sample_scenario):
    monkeypatch.setattr("agents.pipeline.CEREBRAS_API_KEY", "")

    with pytest.raises(RuntimeError, match="CEREBRAS_API_KEY not set"):
        await run_analysis_pipeline(
            ticker="TSLA",
            market_data=sample_market_data,
            scenario=sample_scenario,
        )


@pytest.mark.asyncio
async def test_pipeline_includes_thesis_points(
    mock_cerebras_agent,
    sample_market_data,
    sample_scenario,
):
    thesis = [
        {
            "id": 1,
            "text": "Margins above 18%",
            "metric": "Margins",
            "threshold": "18%",
        }
    ]

    result = await run_analysis_pipeline(
        ticker="TSLA",
        market_data=sample_market_data,
        scenario=sample_scenario,
        thesis_points=thesis,
    )

    assert len(result["thesis_points"]) >= 1
