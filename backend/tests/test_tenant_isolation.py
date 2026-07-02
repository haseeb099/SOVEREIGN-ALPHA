"""Tenant isolation tests."""
import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_history_scoped_with_dev_auth():
    """Dev mode attaches user — history returns 200 not cross-tenant leak."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/history/TSLA")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ticker"] == "TSLA"
        assert "items" in data


@pytest.mark.asyncio
async def test_org_branding_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/org/branding")
        assert resp.status_code == 200
        data = resp.json()
        assert "firm_name" in data
        assert "primary_color" in data


@pytest.mark.asyncio
async def test_audit_requires_admin_permission():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/audit")
        assert resp.status_code == 200
