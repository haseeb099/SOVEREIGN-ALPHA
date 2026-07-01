"""Agent memory service tests."""
import pytest
from unittest.mock import AsyncMock


@pytest.mark.asyncio
async def test_load_thesis_evolution_formats_history(monkeypatch):
    from services.agent_memory_service import load_thesis_evolution

    history = [
        {
            "created_at": "2026-06-01T12:00:00Z",
            "memo": {"rating": "NEUTRAL", "price_target": 200, "summary": "Baseline view"},
        },
        {
            "created_at": "2026-06-15T12:00:00Z",
            "memo": {"rating": "BULLISH", "price_target": 240, "summary": "Upgraded on margins"},
        },
    ]
    monkeypatch.setattr(
        "services.agent_memory_service.get_analysis_history",
        AsyncMock(return_value=history),
    )

    block = await load_thesis_evolution("TSLA", user_id="user-1", limit=3)
    assert "PRIOR_ANALYSES" in block
    assert "BULLISH" in block
    assert "rating BULLISH→NEUTRAL" in block or "NEUTRAL" in block


@pytest.mark.asyncio
async def test_load_thesis_evolution_empty_history(monkeypatch):
    from services.agent_memory_service import load_thesis_evolution

    monkeypatch.setattr(
        "services.agent_memory_service.get_analysis_history",
        AsyncMock(return_value=[]),
    )
    assert await load_thesis_evolution("TSLA") == ""
