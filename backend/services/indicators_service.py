"""Technical indicators computed from OHLCV price bars (numpy)."""
from __future__ import annotations

from typing import Any

import numpy as np


def _closes(bars: list[dict[str, Any]]) -> np.ndarray:
    return np.array(
        [float(b.get("close") or b.get("c") or 0) for b in bars],
        dtype=np.float64,
    )


def _volumes(bars: list[dict[str, Any]]) -> np.ndarray:
    return np.array(
        [float(b.get("volume") or b.get("v") or 0) for b in bars],
        dtype=np.float64,
    )


def _dates(bars: list[dict[str, Any]]) -> list[str]:
    return [str(b.get("date") or b.get("time") or "") for b in bars]


def _ema(series: np.ndarray, period: int) -> np.ndarray:
    out = np.full_like(series, np.nan, dtype=np.float64)
    if len(series) < period:
        return out
    alpha = 2.0 / (period + 1)
    out[period - 1] = np.mean(series[:period])
    for i in range(period, len(series)):
        out[i] = alpha * series[i] + (1 - alpha) * out[i - 1]
    return out


def compute_rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    """Relative Strength Index."""
    out = np.full(len(closes), np.nan, dtype=np.float64)
    if len(closes) < period + 1:
        return out
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])
    if avg_loss == 0:
        out[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        out[period] = 100.0 - (100.0 / (1.0 + rs))
    for i in range(period + 1, len(closes)):
        avg_gain = (avg_gain * (period - 1) + gains[i - 1]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i - 1]) / period
        if avg_loss == 0:
            out[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            out[i] = 100.0 - (100.0 / (1.0 + rs))
    return out


def compute_macd(
    closes: np.ndarray,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """MACD line, signal line, and histogram."""
    ema_fast = _ema(closes, fast)
    ema_slow = _ema(closes, slow)
    macd_line = ema_fast - ema_slow
    signal_line = np.full_like(macd_line, np.nan, dtype=np.float64)
    valid_start = slow - 1
    if valid_start < len(closes):
        macd_tail = macd_line[valid_start:]
        if len(macd_tail) >= signal:
            signal_line[valid_start:] = _ema(macd_tail, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def compute_bollinger(
    closes: np.ndarray,
    period: int = 20,
    num_std: float = 2.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Bollinger Bands: upper, middle (SMA), lower."""
    n = len(closes)
    upper = np.full(n, np.nan, dtype=np.float64)
    middle = np.full(n, np.nan, dtype=np.float64)
    lower = np.full(n, np.nan, dtype=np.float64)
    if n < period:
        return upper, middle, lower
    for i in range(period - 1, n):
        window = closes[i - period + 1 : i + 1]
        sma = np.mean(window)
        std = np.std(window, ddof=0)
        middle[i] = sma
        upper[i] = sma + num_std * std
        lower[i] = sma - num_std * std
    return upper, middle, lower


def compute_volume_sma(volumes: np.ndarray, period: int = 20) -> np.ndarray:
    """Simple moving average of volume."""
    out = np.full(len(volumes), np.nan, dtype=np.float64)
    if len(volumes) < period:
        return out
    for i in range(period - 1, len(volumes)):
        out[i] = np.mean(volumes[i - period + 1 : i + 1])
    return out


def _series_payload(dates: list[str], values: np.ndarray) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for d, v in zip(dates, values):
        if np.isnan(v):
            continue
        rows.append({"date": d, "value": round(float(v), 4)})
    return rows


def compute_indicators(bars: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Compute RSI, MACD, Bollinger Bands, and volume SMA from OHLCV bars.
    Returns chart-aligned series keyed by indicator name.
    """
    if not bars:
        return {
            "rsi": [],
            "macd": {"line": [], "signal": [], "histogram": []},
            "bollinger": {"upper": [], "middle": [], "lower": []},
            "volume_sma": [],
        }

    dates = _dates(bars)
    closes = _closes(bars)
    volumes = _volumes(bars)

    rsi = compute_rsi(closes, period=14)
    macd_line, signal_line, histogram = compute_macd(closes)
    upper, middle, lower = compute_bollinger(closes)
    vol_sma = compute_volume_sma(volumes)

    return {
        "rsi": _series_payload(dates, rsi),
        "macd": {
            "line": _series_payload(dates, macd_line),
            "signal": _series_payload(dates, signal_line),
            "histogram": _series_payload(dates, histogram),
        },
        "bollinger": {
            "upper": _series_payload(dates, upper),
            "middle": _series_payload(dates, middle),
            "lower": _series_payload(dates, lower),
        },
        "volume_sma": _series_payload(dates, vol_sma),
    }
