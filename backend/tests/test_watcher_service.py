"""Watcher service tests."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_watcher_new_filing_triggers_ingest(monkeypatch):
    from services import watcher_service

    filing = {
        "form": "8-K",
        "accession": "0001-24-000001",
        "ticker": "TSLA",
        "cik": "0001318605",
    }

    monkeypatch.setenv("WATCHER_ENABLED", "true")

    with patch("services.watcher_service.detect_new_filings", AsyncMock(return_value=[filing])):
        with patch("services.watcher_service.fetch_and_index_edgar", AsyncMock(return_value=[])) as ingest:
            with patch("services.watcher_service.mark_filing_seen", AsyncMock()):
                with patch("services.watcher_service._trigger_analyze", AsyncMock(return_value=True)):
                    with patch("services.watcher_service.AsyncSessionLocal", None):
                        with patch("services.watcher_service._fire_filing_alert", AsyncMock()):
                            events = await watcher_service.process_ticker("TSLA")

    ingest.assert_called_once()
    assert events[0]["form"] == "8-K"
    assert events[0]["analysis_triggered"] is True


@pytest.mark.asyncio
async def test_poll_once_disabled(monkeypatch):
    from services.watcher_service import poll_once

    monkeypatch.setenv("WATCHER_ENABLED", "false")
    result = await poll_once()
    assert result["enabled"] is False
