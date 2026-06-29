"""Integration tests for /api/analyze."""
from unittest.mock import AsyncMock

import pytest

from tests.conftest import ANALYZE_SCHEMA_KEYS, MEMO_SCHEMA_KEYS


@pytest.mark.asyncio
async def test_analyze_response_matches_schema(
    client,
    mock_persistence,
    sample_market_data,
    sample_pipeline_result,
    monkeypatch,
):
    monkeypatch.setattr(
        "routers.analyze.get_market_data",
        AsyncMock(return_value=sample_market_data),
    )
    monkeypatch.setattr(
        "routers.analyze.run_analysis_pipeline",
        AsyncMock(return_value=sample_pipeline_result),
    )

    resp = await client.post(
        "/api/analyze",
        json={
            "ticker": "TSLA",
            "scenario": {
                "margins": 18.5,
                "rates": 4.5,
                "regulatory": "Low",
                "sentiment": "Neutral",
            },
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) == ANALYZE_SCHEMA_KEYS
    assert set(data["memo"].keys()) == MEMO_SCHEMA_KEYS
    assert data["ticker"] == "TSLA"
    assert data["memo"]["rating"] == "BULLISH"


@pytest.mark.asyncio
async def test_analyze_pipeline_error_returns_503(client, monkeypatch, sample_market_data):
    monkeypatch.setattr(
        "routers.analyze.get_market_data",
        AsyncMock(return_value=sample_market_data),
    )
    monkeypatch.setattr(
        "routers.analyze.run_analysis_pipeline",
        AsyncMock(side_effect=RuntimeError("CEREBRAS_API_KEY not set")),
    )

    resp = await client.post(
        "/api/analyze",
        json={"ticker": "TSLA", "scenario": {}},
    )

    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_analyze_passes_thesis_points(
    client,
    mock_persistence,
    sample_market_data,
    sample_pipeline_result,
    monkeypatch,
):
    captured = {}

    async def fake_pipeline(**kwargs):
        captured.update(kwargs)
        return sample_pipeline_result

    monkeypatch.setattr(
        "routers.analyze.get_market_data",
        AsyncMock(return_value=sample_market_data),
    )
    monkeypatch.setattr("routers.analyze.run_analysis_pipeline", fake_pipeline)

    thesis = [{"id": 1, "text": "Margins > 18%"}]
    resp = await client.post(
        "/api/analyze",
        json={"ticker": "TSLA", "scenario": {}, "thesis_points": thesis},
    )

    assert resp.status_code == 200
    assert captured["thesis_points"] == thesis
