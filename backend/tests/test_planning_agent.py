"""Planning agent tests."""
import pytest
from unittest.mock import MagicMock


@pytest.mark.asyncio
async def test_planning_returns_valid_plan_json(monkeypatch):
    from agents.planning_agent import run_planning

    monkeypatch.setattr("cerebras_config.CEREBRAS_API_KEY", "")

    plan = await run_planning("Full due diligence on TSLA")

    assert plan.get("ticker") == "TSLA"
    assert isinstance(plan.get("steps"), list)
    assert len(plan["steps"]) >= 3
    tools = {s.get("tool") for s in plan["steps"]}
    assert "edgar" in tools
    assert "web_search" in tools


@pytest.mark.asyncio
async def test_planning_mocked_cerebras(monkeypatch):
    from agents.planning_agent import run_planning

    fake_plan = {
        "ticker": "AAPL",
        "goal_summary": "Apple DD",
        "steps": [
            {"id": "fetch_edgar", "tool": "edgar", "params": {"form": "10-K"}},
            {"id": "analyze", "tool": "analysis_pipeline"},
        ],
        "requires_hitl": ["fetch_edgar"],
    }

    monkeypatch.setattr("cerebras_config.CEREBRAS_API_KEY", "mock")
    monkeypatch.setattr(
        "agents.planning_agent._call_agent",
        lambda _client, _prompt, _msg: fake_plan,
    )
    monkeypatch.setattr(
        "agents.planning_agent.require_cerebras_client",
        lambda: MagicMock(),
    )

    plan = await run_planning("Analyze Apple stock")
    assert plan["ticker"] == "AAPL"
    assert plan["goal_summary"] == "Apple DD"
