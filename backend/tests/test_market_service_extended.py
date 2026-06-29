"""Additional market_service coverage for live fetch paths."""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.market_service import _fetch_ccxt, _fetch_yfinance, get_market_data


@pytest.mark.asyncio
async def test_fetch_yfinance_computes_metrics(monkeypatch):
    import pandas as pd

    class FakeInfo:
        last_price = 200.0
        previous_close = 190.0

    class FakeHist:
        def __len__(self):
            return 10

        def __getitem__(self, key):
            if key == "Close":
                return pd.Series([190, 191, 192, 193, 194, 195, 196, 197, 198, 200])
            raise KeyError(key)

    class FakeTicker:
        fast_info = FakeInfo()

        def history(self, period="30d"):
            return FakeHist()

    monkeypatch.setattr("services.market_service.yf.Ticker", lambda _t: FakeTicker())

    config = {
        "full_name": "Tesla Motors Inc.",
        "asset_class": "Equity / Auto-Tech",
        "icon": "electric_car",
    }
    data = await _fetch_yfinance("TSLA", config)

    assert data["price"] == 200.0
    assert data["change_pct"] == pytest.approx(5.26, rel=0.01)
    assert data["is_positive"] is True
    assert data["source"] == "yfinance"
    assert data["volatility_30d"] >= 0


@pytest.mark.asyncio
async def test_fetch_ccxt_crypto_path(monkeypatch):
    class FakeExchange:
        async def fetch_ticker(self, symbol):
            assert symbol == "BTC/USDT"
            return {
                "last": 94_250.0,
                "percentage": 5.8,
                "high": 96_000.0,
                "low": 92_500.0,
            }

        async def close(self):
            return None

    fake_ccxt = MagicMock()
    fake_ccxt.binance.return_value = FakeExchange()
    monkeypatch.setitem(__import__("sys").modules, "ccxt.async_support", fake_ccxt)

    config = {
        "full_name": "Bitcoin USD Spot",
        "asset_class": "Digital Commodity",
        "icon": "currency_bitcoin",
    }
    data = await _fetch_ccxt("BTC/USDT", config)

    assert data["price"] == 94_250.0
    assert data["source"] == "ccxt_binance"


@pytest.mark.asyncio
async def test_btc_market_uses_ccxt_source(monkeypatch, sample_market_data):
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()

    async def fake_ccxt(_symbol, config):
        return {**sample_market_data, "asset_key": "BTC", "source": "ccxt_binance"}

    monkeypatch.setattr("services.market_service.get_redis", AsyncMock(return_value=mock_redis))
    monkeypatch.setattr("services.polygon_service.get_snapshot", AsyncMock(return_value=None))
    monkeypatch.setattr("services.market_service._fetch_ccxt", fake_ccxt)

    data = await get_market_data("BTC")
    assert data["source"] == "ccxt_binance"
