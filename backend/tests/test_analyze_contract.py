"""JSON Schema contract tests for POST /api/analyze."""
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from tests.contract_utils import load_schema, validate_against_schema


@pytest.fixture
def analyze_schema():
    return load_schema("analyze_response.schema.json")


def test_analyze_schema_file_is_valid_json_schema(analyze_schema):
    assert analyze_schema["title"] == "AnalyzeResponse"
    assert "memo" in analyze_schema["properties"]
    assert "BULLISH" in analyze_schema["properties"]["memo"]["properties"]["rating"]["enum"]


def test_sample_pipeline_result_satisfies_contract(sample_pipeline_result, sample_market_data):
    from services.sovereign_score_service import attach_sovereign_score
    from services.valuation_engine import apply_to_memo

    payload = dict(sample_pipeline_result)
    raw = payload.get("raw_agents") or {}
    payload["memo"] = apply_to_memo(
        payload["memo"],
        sample_market_data.get("price", 0),
        raw.get("bull"),
        raw.get("red_team"),
    )
    payload = attach_sovereign_score(payload, sample_market_data)
    errors = validate_against_schema(payload, "analyze_response.schema.json")
    assert errors == [], f"Contract violations: {errors}"


@pytest.mark.asyncio
async def test_analyze_endpoint_response_satisfies_contract(
    client,
    mock_persistence,
    sample_market_data,
    sample_pipeline_result,
    monkeypatch,
):
    async def enriched_pipeline(**kwargs):
        from services.sovereign_score_service import attach_sovereign_score
        from services.valuation_engine import apply_to_memo

        result = dict(sample_pipeline_result)
        raw = result.get("raw_agents") or {}
        result["memo"] = apply_to_memo(
            result["memo"],
            sample_market_data.get("price", 0),
            raw.get("bull"),
            raw.get("red_team"),
        )
        return attach_sovereign_score(result, sample_market_data)

    monkeypatch.setattr(
        "routers.analyze.get_market_data",
        AsyncMock(return_value=sample_market_data),
    )
    monkeypatch.setattr(
        "routers.analyze.run_analysis_pipeline",
        enriched_pipeline,
    )
    monkeypatch.setattr("routers.analyze.get_earnings_overlay", AsyncMock(return_value=None))
    monkeypatch.setattr("routers.analyze.index_market_snapshot", AsyncMock(return_value=True))
    monkeypatch.setattr(
        "routers.analyze.retrieve",
        AsyncMock(
            return_value=[
                {
                    "chunk_id": "market-TSLA",
                    "source_type": "market",
                    "chunk_text": "TSLA spot $185.20",
                    "source_label": "Polygon live quote",
                    "source_date": "2026-06-30",
                }
            ]
        ),
    )

    resp = await client.post(
        "/api/analyze",
        json={
            "ticker": "TSLA",
            "scenario": sample_pipeline_result["scenario"],
        },
    )

    assert resp.status_code == 200
    errors = validate_against_schema(resp.json(), "analyze_response.schema.json")
    assert errors == [], f"Contract violations: {errors}"


def test_contract_rejects_missing_memo_rating(sample_pipeline_result):
    broken = deepcopy(sample_pipeline_result)
    del broken["memo"]["rating"]

    errors = validate_against_schema(broken, "analyze_response.schema.json")
    assert any("rating" in e for e in errors)


def test_contract_rejects_invalid_rating_enum(sample_pipeline_result):
    broken = deepcopy(sample_pipeline_result)
    broken["memo"]["rating"] = "MAYBE"

    errors = validate_against_schema(broken, "analyze_response.schema.json")
    assert any("MAYBE" in e or "rating" in e for e in errors)


def test_contract_rejects_renamed_frontend_field(sample_pipeline_result):
    """Guard against breaking api-wiring.js memo field names."""
    broken = deepcopy(sample_pipeline_result)
    broken["memo"]["bull_case"] = broken["memo"].pop("bull_verdict")

    errors = validate_against_schema(broken, "analyze_response.schema.json")
    assert errors, "Renamed bull_verdict should fail contract validation"


@pytest.mark.asyncio
async def test_pipeline_output_satisfies_contract(
    mock_cerebras_agent,
    sample_market_data,
    sample_scenario,
):
    from agents.pipeline import run_analysis_pipeline

    result = await run_analysis_pipeline(
        ticker="TSLA",
        market_data=sample_market_data,
        scenario=sample_scenario,
    )

    from services.sovereign_score_service import attach_sovereign_score
    from services.valuation_engine import apply_to_memo

    raw = result.get("raw_agents") or {}
    result["memo"] = apply_to_memo(
        result["memo"],
        sample_market_data.get("price", 0),
        raw.get("bull"),
        raw.get("red_team"),
    )
    result = attach_sovereign_score(result, sample_market_data)

    errors = validate_against_schema(result, "analyze_response.schema.json")
    assert errors == [], f"Pipeline contract violations: {errors}"
