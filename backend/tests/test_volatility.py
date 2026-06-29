"""Unit tests for BTC volatility estimation in market_service."""


def annualised_btc_volatility(high: float, low: float, price: float) -> float:
    """Mirror the formula used in _fetch_ccxt."""
    volatility_est = ((high - low) / price * 100) if price else 0
    return round(volatility_est * 2.5, 1)


def test_btc_volatility_formula():
    # price=100000, high=102000, low=98000 → range 4% daily est → 10.0 annualised
    assert annualised_btc_volatility(102_000, 98_000, 100_000) == 10.0


def test_btc_volatility_zero_price():
    assert annualised_btc_volatility(100, 90, 0) == 0.0
