"""Alert evaluation tests."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from routers.alerts import _evaluate_rule, evaluate_rules_for_ticker


@pytest.mark.asyncio
async def test_thesis_score_drop_fires(monkeypatch):
    from datetime import datetime, timezone
    from models import AlertRule, ThesisHealthSnapshot

    rule = AlertRule(
        user_id="user1",
        ticker="TSLA",
        condition="thesis_score_drop",
        channel="in_app",
        threshold=10,
        active=True,
    )
    prior = ThesisHealthSnapshot(
        user_id="user1",
        ticker="TSLA",
        score=80,
        target=220,
        created_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
    )
    latest = ThesisHealthSnapshot(
        user_id="user1",
        ticker="TSLA",
        score=65,
        target=210,
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )

    session = MagicMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [latest, prior]
    session.execute = AsyncMock(return_value=result_mock)

    notification = await _evaluate_rule(session, rule, None)
    assert notification is not None
    assert "degraded" in notification["message"]


@pytest.mark.asyncio
async def test_evaluate_rules_for_ticker_no_db(monkeypatch):
    monkeypatch.setattr(
        "routers.alerts.AsyncSessionLocal",
        None,
    )
    # When DB unavailable, returns empty without raising
    result = await evaluate_rules_for_ticker("TSLA")
    assert result == []
