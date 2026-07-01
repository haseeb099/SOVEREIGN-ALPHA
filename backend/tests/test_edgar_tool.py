"""EDGAR tool tests."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_fetch_and_index_edgar_indexes_filing_chunks():
    from agents.tools.edgar_tool import fetch_and_index_edgar

    long_body = "Revenue grew ten percent year over year. " * 20
    cik_payload = {"0": {"ticker": "TSLA", "cik_str": 1318605}}
    submissions = {
        "filings": {
            "recent": {
                "form": ["10-K", "8-K"],
                "accessionNumber": ["0001-23-000001"],
                "primaryDocument": ["tsla-10k.htm"],
                "filingDate": ["2025-01-31"],
            }
        }
    }

    async def fake_get(url):
        resp = type("R", (), {"raise_for_status": lambda self: None})()
        if "company_tickers" in url:
            resp.json = lambda: cik_payload
        elif "submissions" in url:
            resp.json = lambda: submissions
        else:
            resp.text = f"<html><body>{long_body}</body></html>"
        return resp

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=fake_get)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("agents.tools.edgar_tool.httpx.AsyncClient", return_value=mock_client):
        with patch("agents.tools.edgar_tool.index_document", new=AsyncMock(return_value=2)):
            chunks = await fetch_and_index_edgar("TSLA", form="10-K")

    assert len(chunks) >= 1
    assert chunks[0]["source_type"] == "filing"
