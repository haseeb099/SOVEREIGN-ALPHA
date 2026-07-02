"""ESG tool tests — OpenSanctions mock."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_esg_opensanctions_screen():
    from agents.tools.esg_tool import fetch_and_index_esg

    sanctions_resp = {"results": []}

    mock_resp = type("R", (), {"status_code": 200, "json": lambda self: sanctions_resp})()

    with patch("agents.tools.esg_tool.httpx.AsyncClient") as mock_client:
        inst = AsyncMock()
        inst.get = AsyncMock(return_value=mock_resp)
        inst.__aenter__ = AsyncMock(return_value=inst)
        inst.__aexit__ = AsyncMock(return_value=False)
        mock_client.return_value = inst
        with patch("agents.tools.esg_tool.fetch_and_index_edgar", AsyncMock(return_value=[])):
            with patch("agents.tools.esg_tool.index_document", AsyncMock(return_value=1)):
                chunks = await fetch_and_index_esg("TSLA")

    assert len(chunks) >= 1
    payload = chunks[-1].get("esg_payload") or {}
    assert payload.get("sanctions_hit") is False
