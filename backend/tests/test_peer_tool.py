"""Peer tool tests."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_resolve_peers_keyword_fallback(monkeypatch):
    from agents.tools.peer_tool import resolve_peers

    monkeypatch.delenv("POLYGON_API_KEY", raising=False)
    peers = await resolve_peers("TSLA", sector_hint="auto")
    assert len(peers) >= 1
    assert all("ticker" in p for p in peers)


@pytest.mark.asyncio
async def test_fetch_and_index_peers():
    from agents.tools.peer_tool import fetch_and_index_peers

    with patch("agents.tools.peer_tool.resolve_peers", AsyncMock(return_value=[{"ticker": "RIVN", "name": "Rivian"}])):
        with patch("agents.tools.peer_tool.index_document", AsyncMock(return_value=1)):
            chunks = await fetch_and_index_peers("TSLA")

    assert len(chunks) == 1
    assert chunks[0]["peers"][0]["ticker"] == "RIVN"
