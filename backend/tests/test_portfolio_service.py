"""Portfolio service tests."""
from unittest.mock import AsyncMock

import pytest

from services.portfolio_service import compute_portfolio_summary


@pytest.mark.asyncio
async def test_empty_portfolio():
    result = await compute_portfolio_summary([])
    assert result["total_value"] == 0
    assert result["holdings"] == []


@pytest.mark.asyncio
async def test_sector_weights_from_lookup(monkeypatch):
    monkeypatch.setattr(
        "services.portfolio_service.get_market_data",
        AsyncMock(return_value={"price": 100, "asset_class": "Equity"}),
    )
    monkeypatch.setattr(
        "services.portfolio_service.get_ticker_sector",
        AsyncMock(side_effect=["Technology", "Healthcare"]),
    )

    holdings = [
        {"ticker": "AAPL", "shares": 10, "cost_basis": 1500},
        {"ticker": "JNJ", "shares": 5, "cost_basis": 800},
    ]
    result = await compute_portfolio_summary(holdings)
    assert "Technology" in result["sector_weights"]
    assert "Healthcare" in result["sector_weights"]
    assert result["sector_weights"]["Technology"] > result["sector_weights"]["Healthcare"]


@pytest.mark.asyncio
async def test_concentration_flag_over_40_percent(monkeypatch):
    monkeypatch.setattr(
        "services.portfolio_service.get_market_data",
        AsyncMock(return_value={"price": 100, "asset_class": "Equity"}),
    )
    monkeypatch.setattr(
        "services.portfolio_service.get_ticker_sector",
        AsyncMock(return_value="Technology"),
    )

    holdings = [
        {"ticker": "AAPL", "shares": 90, "cost_basis": 9000},
        {"ticker": "MSFT", "shares": 10, "cost_basis": 1000},
    ]
    result = await compute_portfolio_summary(holdings)
    assert any("AAPL" in flag for flag in result["concentration_flags"])
