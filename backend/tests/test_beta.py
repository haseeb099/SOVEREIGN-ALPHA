"""Beta programme API tests."""
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_beta_apply(client, monkeypatch):
    monkeypatch.setenv("SKIP_DB_INIT", "false")

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()

    class _Ctx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.beta.AsyncSessionLocal", lambda: _Ctx())
    resp = await client.post(
        "/api/beta/apply",
        json={
            "email": "analyst@fund.com",
            "name": "Jane Doe",
            "firm": "Alpha Capital",
            "use_case": "Faster diligence on growth equities with audit trail.",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"


@pytest.mark.asyncio
async def test_beta_verify_invalid_code(client, monkeypatch):
    monkeypatch.setenv("SKIP_DB_INIT", "false")

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    class _Ctx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.beta.AsyncSessionLocal", lambda: _Ctx())

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/beta/verify",
        "headers": [],
    }
    from starlette.requests import Request

    request = Request(scope)
    request.state.user_id = "user_beta_test"

    from routers.beta import beta_verify, BetaVerifyRequest

    with pytest.raises(HTTPException) as exc:
        await beta_verify(request, BetaVerifyRequest(invite_code="SA-INVALID1"))
    assert exc.value.status_code == 400
