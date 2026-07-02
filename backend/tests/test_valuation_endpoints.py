"""Contract tests for valuation and risk endpoints."""
from unittest.mock import AsyncMock, MagicMock
import uuid

import pytest


SAMPLE_FINANCIALS = {
    "ticker": "TSLA",
    "revenue": 1_000_000_000,
    "fcf": 120_000_000,
    "ebitda": 150_000_000,
    "net_debt": 200_000_000,
    "shares_outstanding": 10_000_000,
    "current_price": 200,
    "source": "test",
}


@pytest.mark.asyncio
async def test_get_financials(client, monkeypatch):
    monkeypatch.setattr(
        "routers.valuation.fetch_financial_snapshot",
        AsyncMock(return_value=SAMPLE_FINANCIALS),
    )
    resp = await client.get("/api/valuation/TSLA/financials")
    assert resp.status_code == 200
    assert resp.json()["ticker"] == "TSLA"


@pytest.mark.asyncio
async def test_post_dcf(client, monkeypatch):
    monkeypatch.setattr(
        "routers.valuation.fetch_financial_snapshot",
        AsyncMock(return_value=SAMPLE_FINANCIALS),
    )
    monkeypatch.setattr(
        "routers.valuation._with_price",
        AsyncMock(return_value=SAMPLE_FINANCIALS),
    )
    resp = await client.post(
        "/api/valuation/TSLA/dcf",
        json={"assumptions": {"wacc": 0.10, "terminal_growth": 0.025, "projection_years": 5}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "implied_share_price" in data


@pytest.mark.asyncio
async def test_post_generate(client, monkeypatch):
    monkeypatch.setattr(
        "routers.valuation.build_valuation_lab_snapshot",
        AsyncMock(return_value={"ticker": "TSLA", "financials": SAMPLE_FINANCIALS}),
    )
    resp = await client.post("/api/valuation/TSLA/generate", json={"use_llm": False})
    assert resp.status_code == 200
    assert resp.json()["ticker"] == "TSLA"


@pytest.mark.asyncio
async def test_nl_financial_scenario(client):
    resp = await client.post(
        "/api/valuation/nl-scenario",
        json={"text": "margins compress 300bps", "mode": "financial"},
    )
    assert resp.status_code == 200
    assert "parsed_assumptions" in resp.json()


@pytest.mark.asyncio
async def test_portfolio_risk_requires_auth_in_production(client, monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    monkeypatch.setenv("ENVIRONMENT", "production")
    resp = await client.get("/api/risk/portfolio")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_portfolio_risk_dev_auth(client, monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setattr(
        "routers.risk._load_enriched_holdings",
        AsyncMock(return_value=[{"ticker": "TSLA", "shares": 10, "current_price": 200, "weight_pct": 100}]),
    )
    monkeypatch.setattr(
        "routers.risk.compute_portfolio_risk",
        AsyncMock(return_value={
            "portfolio_var_95": -0.02,
            "portfolio_var_99": -0.03,
            "portfolio_cvar_95": -0.025,
            "max_stress_loss_pct": -20,
            "stress_scenarios": [],
            "holding_contributions": [],
        }),
    )
    resp = await client.get("/api/risk/portfolio")
    assert resp.status_code == 200
    assert resp.json()["portfolio_var_95"] == -0.02
