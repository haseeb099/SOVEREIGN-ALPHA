"""Web search tool tests."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_web_search_tavily_path(monkeypatch):
    from agents.tools import web_search_tool

    monkeypatch.setattr(web_search_tool, "TAVILY_API_KEY", "test-key")

    snippet = "Tesla faces margin pressure and rising competition across EV markets in 2026."
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        "results": [
            {"title": "TSLA outlook", "url": "https://example.com", "content": snippet}
        ]
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch.object(web_search_tool, "index_document", new=AsyncMock(return_value=1)):
        with patch("agents.tools.web_search_tool.httpx.AsyncClient", return_value=mock_client):
            chunks = await web_search_tool.search_and_index_web("TSLA", "TSLA risks 2026")

    assert len(chunks) == 1
    assert chunks[0]["source_type"] == "news"


@pytest.mark.asyncio
async def test_web_search_duckduckgo_fallback(monkeypatch):
    from agents.tools import web_search_tool

    monkeypatch.setattr(web_search_tool, "TAVILY_API_KEY", "")

    html = (
        '<a class="result-link" href="https://example.com/tsla">TSLA risks</a>'
        '<td class="result-snippet">Margin pressure remains a key risk factor for Tesla in 2026.</td>'
    )
    mock_get = AsyncMock(
        return_value=type(
            "R",
            (),
            {"raise_for_status": lambda self: None, "text": html},
        )()
    )
    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch.object(web_search_tool, "index_document", new=AsyncMock(return_value=1)):
        with patch("agents.tools.web_search_tool.httpx.AsyncClient", return_value=mock_client):
            chunks = await web_search_tool.search_and_index_web("TSLA", "TSLA risks")

    assert len(chunks) >= 1
