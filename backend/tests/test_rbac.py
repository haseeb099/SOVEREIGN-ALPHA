"""RBAC permission map tests."""
import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from middleware.rbac import is_read_only_role, role_has_permission


@pytest.mark.parametrize(
    "role,permission,expected",
    [
        ("admin", "audit:read", True),
        ("admin", "org:settings", True),
        ("analyst", "analyze:run", True),
        ("analyst", "audit:read", False),
        ("viewer", "thesis:read", True),
        ("viewer", "analyze:run", False),
        (None, "thesis:read", False),
    ],
)
def test_role_has_permission(role, permission, expected):
    assert role_has_permission(role, permission) is expected


def test_is_read_only_role():
    assert is_read_only_role("viewer") is True
    assert is_read_only_role("analyst") is False
    assert is_read_only_role("admin") is False


@pytest.mark.asyncio
async def test_history_requires_auth(monkeypatch):
    monkeypatch.setattr("middleware.auth.dev_auth_enabled", lambda: False)
    monkeypatch.setattr("middleware.auth.CLERK_SECRET_KEY", "test-key")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/history/TSLA")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_feedback_requires_auth(monkeypatch):
    monkeypatch.setattr("middleware.auth.dev_auth_enabled", lambda: False)
    monkeypatch.setattr("middleware.auth.CLERK_SECRET_KEY", "test-key")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/feedback",
            json={
                "ticker": "TSLA",
                "section": "summary",
                "vote": "up",
            },
        )
        assert resp.status_code == 401
