"""Extended EDGAR tool tests — Form 4, list filings, detect new."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_list_recent_filings_filters_forms():
    from agents.tools.edgar_tool import list_recent_filings

    submissions = {
        "filings": {
            "recent": {
                "form": ["10-K", "8-K", "4"],
                "accessionNumber": ["0001", "0002", "0003"],
                "primaryDocument": ["a.htm", "b.htm", "c.xml"],
                "filingDate": ["2025-01-01", "2025-02-01", "2025-03-01"],
            }
        }
    }

    with patch("agents.tools.edgar_tool._fetch_submissions", AsyncMock(return_value=submissions)):
        rows = await list_recent_filings("0001318605", forms=["8-K", "4"], limit=5)

    assert len(rows) == 2
    assert rows[0]["form"] == "8-K"


@pytest.mark.asyncio
async def test_fetch_form4_insider_activity_parses():
    from agents.tools.edgar_tool import fetch_form4_insider_activity

    filings = [{"form": "4", "accession": "0001", "primary_document": "form4.xml", "filed_at": "2025-01-01"}]
    body = "John Smith bought 1000 shares at $50.00 " * 5

    with patch("agents.tools.edgar_tool._lookup_cik", AsyncMock(return_value="0001318605")):
        with patch("agents.tools.edgar_tool.list_recent_filings", AsyncMock(return_value=filings)):
            with patch(
                "agents.tools.edgar_tool.fetch_filing_by_accession",
                AsyncMock(return_value=("label", body)),
            ):
                activities = await fetch_form4_insider_activity("TSLA", limit=5)

    assert len(activities) >= 1
    assert activities[0]["side"] in ("buy", "sell", "unknown")


@pytest.mark.asyncio
async def test_detect_new_filings_returns_unseen():
    from agents.tools.edgar_tool import detect_new_filings

    filings = [
        {"form": "8-K", "accession": "0001-24-000001", "accession_compact": "000124000001"},
    ]

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value="0000-old-accession")

    with patch("agents.tools.edgar_tool._lookup_cik", AsyncMock(return_value="0001318605")):
        with patch("agents.tools.edgar_tool.list_recent_filings", AsyncMock(return_value=filings)):
            with patch("agents.tools.edgar_tool._get_redis", AsyncMock(return_value=mock_redis)):
                new = await detect_new_filings("TSLA")

    assert len(new) == 1
    assert new[0]["ticker"] == "TSLA"
