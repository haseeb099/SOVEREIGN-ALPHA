"""Auth middleware tests."""
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from middleware.auth import dev_auth_enabled, extract_user_id, require_auth


def _make_request(headers: dict | None = None) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_health_is_public(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("online", "degraded", "offline", "partial")
    assert "subsystems" in data
    assert "database" in data["subsystems"]
    assert "redis" in data["subsystems"]
    assert "polygon" in data["subsystems"]
    assert "cerebras" in data["subsystems"]


@pytest.mark.asyncio
async def test_market_endpoint_requires_no_auth(client, monkeypatch):
    from unittest.mock import AsyncMock

    monkeypatch.setattr(
        "routers.market.get_market_data",
        AsyncMock(
            return_value={
                "price": 100,
                "change_pct": 1.0,
                "volatility_30d": 20,
                "full_name": "Tesla",
                "asset_class": "Equity",
                "icon": "electric_car",
                "is_positive": True,
                "source": "test",
                "fetched_at": 0,
            }
        ),
    )

    resp = await client.get("/api/market/TSLA")
    assert resp.status_code == 200


def test_require_auth_raises_without_user():
    request = _make_request()
    request.state.user_id = None
    with pytest.raises(HTTPException) as exc:
        require_auth(request)
    assert exc.value.status_code == 401


def test_extract_user_id_dev_decode(monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    import jwt

    token = jwt.encode({"sub": "user_test123"}, "secret", algorithm="HS256")
    request = _make_request({"Authorization": f"Bearer {token}"})
    assert extract_user_id(request) == "user_test123"


def test_extract_user_id_missing_header():
    request = _make_request()
    assert extract_user_id(request) is None


def test_dev_auth_enabled_without_clerk(monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "development")
    assert dev_auth_enabled() is True


def test_dev_auth_disabled_when_clerk_configured(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    monkeypatch.setenv("ENVIRONMENT", "development")
    assert dev_auth_enabled() is False


@pytest.mark.asyncio
async def test_auth_middleware_assigns_dev_user(monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "development")

    from middleware.auth import AuthMiddleware, DEV_LOCAL_USER
    from starlette.responses import JSONResponse

    async def call_next(request):
        return JSONResponse({"user_id": getattr(request.state, "user_id", None)})

    middleware = AuthMiddleware(app=object())
    request = _make_request()
    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 200
    import json

    assert json.loads(response.body)["user_id"] == DEV_LOCAL_USER
