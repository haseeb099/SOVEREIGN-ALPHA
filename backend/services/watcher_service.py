"""EDGAR filing watcher — background poll loop and one-shot CLI."""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from agents.tools.edgar_tool import (
    detect_new_filings,
    fetch_and_index_edgar,
    mark_filing_seen,
)
from agents.tools.insider_tool import fetch_and_index_insider
from database import AsyncSessionLocal
from models import FilingEvent, FilingWatchSubscription, ThesisAnalysis, Watchlist

logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.environ.get("WATCHER_POLL_INTERVAL_SECONDS", "300"))
TRIGGER_FORMS = {"10-Q", "8-K", "10-K"}

_last_poll_at: datetime | None = None
_tickers_monitored: list[str] = []


def _enabled() -> bool:
    return os.environ.get("WATCHER_ENABLED", "true").lower() in ("1", "true", "yes")


async def _collect_tickers() -> set[str]:
    tickers: set[str] = set()
    try:
        async with AsyncSessionLocal() as session:
            wl_rows = (await session.execute(select(Watchlist))).scalars().all()
            for wl in wl_rows:
                for t in wl.tickers or []:
                    tickers.add(str(t).upper())

            sub_rows = (
                await session.execute(
                    select(FilingWatchSubscription).where(FilingWatchSubscription.enabled == True)  # noqa: E712
                )
            ).scalars().all()
            for sub in sub_rows:
                tickers.add(sub.ticker.upper())

            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            analysis_rows = (
                await session.execute(
                    select(ThesisAnalysis.ticker).where(ThesisAnalysis.created_at >= cutoff)
                )
            ).all()
            for (ticker,) in analysis_rows:
                if ticker:
                    tickers.add(ticker.upper())
    except Exception as exc:
        logger.warning("Watcher ticker collection failed: %s", exc)
    return tickers


async def _trigger_analyze(ticker: str) -> bool:
    try:
        from routers.analyze import AnalyzeRequest, ScenarioInput, _run_analyze

        req = AnalyzeRequest(ticker=ticker, scenario=ScenarioInput(), enable_research=True)
        await _run_analyze(req, user_id=None)
        return True
    except Exception as exc:
        logger.warning("Watcher analyze re-run failed for %s: %s", ticker, exc)
        return False


async def _fire_filing_alert(ticker: str, form: str, accession: str) -> None:
    try:
        from routers.alerts import evaluate_rules_for_ticker

        await evaluate_rules_for_ticker(
            ticker,
            user_id=None,
            latest_analysis={"filing_event": {"ticker": ticker, "form": form, "accession": accession}},
        )
    except Exception as exc:
        logger.debug("Filing alert evaluation skipped: %s", exc)


async def process_ticker(ticker: str) -> list[dict]:
    """Detect, ingest, and optionally re-analyze new filings for one ticker."""
    events: list[dict] = []
    new_filings = await detect_new_filings(ticker)
    for filing in new_filings:
        form = filing["form"]
        accession = filing["accession"]
        try:
            if form == "4":
                await fetch_and_index_insider(ticker)
            else:
                await fetch_and_index_edgar(ticker, form=form)
            await mark_filing_seen(ticker, form, accession)
        except Exception as exc:
            logger.warning("Watcher ingest failed %s %s: %s", ticker, form, exc)

        triggered = False
        if form in TRIGGER_FORMS:
            triggered = await _trigger_analyze(ticker)

        try:
            async with AsyncSessionLocal() as session:
                row = FilingEvent(
                    id=uuid.uuid4(),
                    ticker=ticker.upper(),
                    form=form,
                    accession=accession,
                    filed_at=None,
                    analysis_triggered=triggered,
                )
                session.add(row)
                await session.commit()
        except Exception as exc:
            logger.debug("Filing event persist skipped: %s", exc)

        await _fire_filing_alert(ticker, form, accession)
        events.append(
            {
                "ticker": ticker.upper(),
                "form": form,
                "accession": accession,
                "analysis_triggered": triggered,
            }
        )
    return events


async def poll_once() -> dict:
    """Single watcher poll cycle."""
    global _last_poll_at, _tickers_monitored
    if not _enabled():
        return {"enabled": False, "events": []}

    tickers = await _collect_tickers()
    _tickers_monitored = sorted(tickers)
    all_events: list[dict] = []
    for ticker in _tickers_monitored:
        try:
            all_events.extend(await process_ticker(ticker))
        except Exception as exc:
            logger.warning("Watcher poll failed for %s: %s", ticker, exc)

    _last_poll_at = datetime.now(timezone.utc)
    return {
        "enabled": True,
        "last_poll_at": _last_poll_at.isoformat(),
        "tickers_monitored": _tickers_monitored,
        "events": all_events,
    }


async def run_loop() -> None:
    """Background poll loop for FastAPI lifespan."""
    if not _enabled():
        logger.info("Filing watcher disabled (WATCHER_ENABLED=false)")
        return
    logger.info("Filing watcher started (interval=%ss)", POLL_INTERVAL)
    while True:
        try:
            result = await poll_once()
            if result.get("events"):
                logger.info("Watcher detected %d new filing(s)", len(result["events"]))
        except Exception as exc:
            logger.warning("Watcher loop error: %s", exc)
        await asyncio.sleep(POLL_INTERVAL)


def get_status() -> dict:
    return {
        "enabled": _enabled(),
        "last_poll_at": _last_poll_at.isoformat() if _last_poll_at else None,
        "poll_interval_seconds": POLL_INTERVAL,
        "tickers_monitored": _tickers_monitored,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run filing watcher once")
    parser.add_argument("--once", action="store_true", help="Single poll cycle")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if args.once:
        print(asyncio.run(poll_once()))
    else:
        asyncio.run(run_loop())
