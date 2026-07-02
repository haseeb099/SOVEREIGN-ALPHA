"""Unit tests for portfolio_risk_service."""
from unittest.mock import AsyncMock

import pytest

from services.portfolio_risk_service import compute_portfolio_risk


def _bars(n=60, start=100.0):
    bars = []
    price = start
    for i in range(n):
        price *= 1.001 if i % 4 else 0.995
        bars.append({"close": price})
    return bars


@pytest.mark.asyncio
async def test_portfolio_risk_empty():
    result = await compute_portfolio_risk([])
    assert result["portfolio_var_95"] is None
    assert result["holding_contributions"] == []


@pytest.mark.asyncio
async def test_portfolio_risk_single_holding(monkeypatch):
    monkeypatch.setattr(
        "services.portfolio_risk_service.get_history",
        AsyncMock(return_value=_bars()),
    )
    holdings = [{"ticker": "TSLA", "shares": 10, "current_price": 200, "weight_pct": 100}]
    result = await compute_portfolio_risk(holdings)
    assert result["observations"] > 0
    assert len(result["stress_scenarios"]) >= 3


@pytest.mark.asyncio
async def test_portfolio_risk_weighted_var(monkeypatch):
    monkeypatch.setattr(
        "services.portfolio_risk_service.get_history",
        AsyncMock(return_value=_bars()),
    )
    holdings = [
        {"ticker": "AAPL", "shares": 10, "current_price": 180},
        {"ticker": "MSFT", "shares": 5, "current_price": 400},
    ]
    result = await compute_portfolio_risk(holdings)
    assert result["total_value"] > 0
    assert len(result["holding_contributions"]) == 2
