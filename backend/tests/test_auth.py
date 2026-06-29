"""Auth tests — JWT not yet implemented; verify public API access today."""
import pytest


@pytest.mark.asyncio
async def test_health_is_public(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "online"


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


@pytest.mark.skip(reason="JWT auth not implemented yet — tracked for Phase 10")
@pytest.mark.asyncio
async def test_protected_endpoint_requires_jwt():
    """Placeholder for future JWT-protected routes."""
    pass
