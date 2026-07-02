"""Unit tests for comps_engine."""
from unittest.mock import AsyncMock

import pytest

from services.comps_engine import _safe_median, run_comps


FINANCIALS = {
    "ticker": "TSLA",
    "revenue": 1_000_000_000,
    "ebitda": 150_000_000,
    "net_debt": 100_000_000,
    "shares_outstanding": 10_000_000,
    "current_price": 200,
}


def test_safe_median_empty():
    assert _safe_median([None, None]) is None


def test_safe_median_values():
    assert _safe_median([2.0, 4.0, 6.0]) == 4.0


@pytest.mark.asyncio
async def test_run_comps_with_mock_peers():
    async def mock_market(ticker):
        return {"price": 100}

    peers = [{"ticker": "AAPL", "name": "Apple"}]
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "services.comps_engine._peer_multiples",
            AsyncMock(return_value={
                "ticker": "AAPL",
                "ev_revenue": 5.0,
                "ev_ebitda": 15.0,
                "pe_ratio": 25.0,
            }),
        )
        result = await run_comps("TSLA", FINANCIALS, peers=peers, market_data_fn=mock_market)
    assert result["implied_price_mid"] > 0
    assert len(result["peers"]) == 1


@pytest.mark.asyncio
async def test_run_comps_empty_peers():
    async def mock_market(ticker):
        return {"price": 100}

    result = await run_comps("TSLA", FINANCIALS, peers=[], market_data_fn=mock_market)
    assert "implied_price_mid" in result
