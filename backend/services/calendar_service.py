"""Unified macro calendar: Fed dates, macro releases, and earnings."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from services.polygon_service import get_earnings_calendar

_MACRO_CALENDAR_PATH = Path(__file__).resolve().parent.parent / "data" / "macro_calendar.json"


def _load_macro_seed() -> list[dict[str, Any]]:
    if not _MACRO_CALENDAR_PATH.exists():
        return []
    try:
        return json.loads(_MACRO_CALENDAR_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
        except ValueError:
            return None


def _earnings_to_events(earnings: list[dict[str, Any]], ticker: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for row in earnings:
        raw_date = (
            row.get("earnings_date")
            or row.get("end_date")
            or row.get("start_date")
        )
        d = _parse_date(str(raw_date) if raw_date else None)
        if not d:
            continue
        period = row.get("fiscal_period")
        year = row.get("fiscal_year")
        title = f"{ticker} Earnings"
        if period and year:
            title = f"{ticker} {period} {year} Earnings"
        events.append(
            {
                "date": d.isoformat(),
                "title": title,
                "type": "earnings",
                "source": row.get("source", "polygon"),
                "ticker": ticker,
            }
        )
    return events


async def get_calendar_events(
    ticker: str | None = None,
    days: int = 30,
) -> list[dict[str, Any]]:
    """
    Merge curated Fed/macro dates with optional ticker earnings.
    Returns events sorted by date within the next `days` window.
    """
    today = date.today()
    end = today + timedelta(days=max(days, 1))
    events: list[dict[str, Any]] = []

    for row in _load_macro_seed():
        d = _parse_date(row.get("date"))
        if not d or d < today or d > end:
            continue
        events.append(
            {
                "date": d.isoformat(),
                "title": row.get("title", "Macro Event"),
                "type": row.get("type", "macro"),
                "source": row.get("source", "curated"),
            }
        )

    if ticker:
        earnings = await get_earnings_calendar(ticker.upper())
        for ev in _earnings_to_events(earnings, ticker.upper()):
            d = _parse_date(ev["date"])
            if d and today <= d <= end:
                events.append(ev)

    events.sort(key=lambda e: e.get("date", ""))
    return events
