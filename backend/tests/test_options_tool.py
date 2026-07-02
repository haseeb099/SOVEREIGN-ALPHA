"""Options tool tests — Polygon mock and fallback."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_options_polygon_snapshot(monkeypatch):
    from agents.tools.options_tool import fetch_and_index_options

    monkeypatch.setenv("POLYGON_API_KEY", "test-key")
    snapshot = {
        "ticker": "TSLA",
        "call_volume": 5000,
        "put_volume": 1000,
        "put_call_ratio": 0.2,
        "unusual_contracts": [{"strike": 200, "type": "call", "volume": 5000}],
        "source": "polygon",
    }

    with patch("agents.tools.options_tool._fetch_polygon_options", AsyncMock(return_value=snapshot)):
        with patch("agents.tools.options_tool.index_document", AsyncMock(return_value=1)):
            chunks = await fetch_and_index_options("TSLA")

    assert len(chunks) == 1
    assert chunks[0]["options_snapshot"]["source"] == "polygon"


@pytest.mark.asyncio
async def test_options_fallback_without_api_key(monkeypatch):
    from agents.tools.options_tool import fetch_and_index_options

    monkeypatch.delenv("POLYGON_API_KEY", raising=False)

    with patch("agents.tools.options_tool.index_document", AsyncMock(return_value=1)):
        chunks = await fetch_and_index_options("TSLA")

    assert chunks[0]["insufficient_data"] is True
