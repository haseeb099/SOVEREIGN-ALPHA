"""Verification agent tests."""
import pytest
from unittest.mock import MagicMock


@pytest.mark.asyncio
async def test_verification_without_api_key(monkeypatch, sample_pipeline_result):
    from agents.verification_agent import run_verification

    monkeypatch.setattr(
        "agents.verification_agent.require_cerebras_client",
        lambda: MagicMock(),
    )
    monkeypatch.setattr(
        "agents.verification_agent._call_agent",
        lambda _client, _prompt, _msg: {
            "passed": True,
            "contradictions": [],
            "recommendation": "proceed",
            "log_message": "Verification complete",
        },
    )

    result = await run_verification(sample_pipeline_result)
    assert result["passed"] is True
    assert result["recommendation"] == "proceed"
    assert result["trace"]["agent"] == "VERIFICATION"


@pytest.mark.asyncio
async def test_verification_adds_contradiction_warnings(monkeypatch, sample_pipeline_result):
    from agents.verification_agent import run_verification

    monkeypatch.setattr(
        "agents.verification_agent.require_cerebras_client",
        lambda: MagicMock(),
    )
    monkeypatch.setattr(
        "agents.verification_agent._call_agent",
        lambda _client, _prompt, _msg: {
            "passed": False,
            "contradictions": ["Bull target conflicts with bear case"],
            "recommendation": "revise",
            "log_message": "Contradictions found",
        },
    )

    result = await run_verification(sample_pipeline_result)
    assert result["passed"] is False
    assert any("Bull target" in c for c in result["contradictions"])
