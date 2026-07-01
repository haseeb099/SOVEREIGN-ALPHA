"""Unit tests for indicators_service."""
import numpy as np
import pytest

from services.indicators_service import (
    compute_bollinger,
    compute_indicators,
    compute_macd,
    compute_rsi,
    compute_volume_sma,
)


def _sample_bars(n: int = 60) -> list[dict]:
    bars = []
    price = 100.0
    for i in range(n):
        drift = 1 + 0.01 * np.sin(i / 5)
        close = round(price * drift, 4)
        bars.append(
            {
                "date": f"2026-01-{i + 1:02d}" if i < 31 else f"2026-02-{i - 30:02d}",
                "open": round(close * 0.99, 4),
                "high": round(close * 1.02, 4),
                "low": round(close * 0.98, 4),
                "close": close,
                "volume": 1_000_000 + i * 10_000,
            }
        )
        price = close
    return bars


def test_rsi_bounds():
    closes = np.array([100 + i * 0.5 for i in range(30)])
    rsi = compute_rsi(closes, period=14)
    valid = rsi[~np.isnan(rsi)]
    assert len(valid) > 0
    assert np.all(valid >= 0)
    assert np.all(valid <= 100)


def test_macd_returns_three_series():
    closes = np.array([100 + np.sin(i / 3) for i in range(40)])
    macd, signal, hist = compute_macd(closes)
    assert len(macd) == len(closes)
    assert len(signal) == len(closes)
    assert len(hist) == len(closes)
    assert not np.all(np.isnan(macd))


def test_bollinger_middle_tracks_price():
    closes = np.array([100.0 + i for i in range(30)])
    upper, middle, lower = compute_bollinger(closes, period=20)
    assert middle[-1] == pytest.approx(119.5, rel=1e-3)
    assert upper[-1] > middle[-1] > lower[-1]


def test_volume_sma():
    volumes = np.array([float(i) for i in range(1, 31)])
    sma = compute_volume_sma(volumes, period=20)
    assert not np.isnan(sma[-1])
    assert sma[-1] == pytest.approx(np.mean(volumes[-20:]), rel=1e-6)


def test_compute_indicators_payload_shape():
    bars = _sample_bars()
    result = compute_indicators(bars)
    assert "rsi" in result
    assert "macd" in result
    assert "bollinger" in result
    assert "volume_sma" in result
    assert len(result["rsi"]) > 0
    assert len(result["macd"]["line"]) > 0
    assert len(result["bollinger"]["upper"]) > 0
    assert len(result["volume_sma"]) > 0
    assert all("date" in row and "value" in row for row in result["rsi"])


def test_compute_indicators_empty_bars():
    result = compute_indicators([])
    assert result["rsi"] == []
    assert result["macd"]["line"] == []
