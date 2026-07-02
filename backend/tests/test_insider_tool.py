"""Insider tool tests."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_fetch_and_index_insider_returns_chunks():
    from agents.tools.insider_tool import fetch_and_index_insider

    activities = [
        {
            "ticker": "TSLA",
            "form": "4",
            "insider_name": "Jane Doe",
            "side": "buy",
            "shares": 1000,
            "filed_at": "2025-01-01",
        }
    ]

    with patch(
        "agents.tools.insider_tool.fetch_form4_insider_activity",
        AsyncMock(return_value=activities),
    ):
        with patch("agents.tools.insider_tool.index_document", AsyncMock(return_value=2)):
            chunks = await fetch_and_index_insider("TSLA")

    assert len(chunks) == 1
    assert chunks[0]["source_type"] == "filing"
    assert "insider_activities" in chunks[0]
