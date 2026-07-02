"""Portfolio risk API routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from models import Holding
from services.portfolio_risk_service import compute_portfolio_risk
from services.portfolio_service import compute_portfolio_summary

router = APIRouter()


class StressShock(BaseModel):
    id: str = "custom"
    label: str = "Custom shock"
    shock_pct: float = Field(..., ge=-1, le=0)
    description: str | None = None
    single_name: bool = False


class PortfolioStressRequest(BaseModel):
    shocks: list[StressShock] = Field(default_factory=list)


def _require_user_id(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


async def _load_enriched_holdings(user_id: str) -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as session:
        stmt = select(Holding).where(Holding.user_id == user_id)
        rows = (await session.execute(stmt)).scalars().all()
        holdings = [
            {
                "id": str(h.id),
                "ticker": h.ticker,
                "shares": h.shares,
                "cost_basis": h.cost_basis,
                "account_label": h.account_label,
            }
            for h in rows
        ]
    summary = await compute_portfolio_summary(holdings)
    return summary.get("holdings") or []


@router.get("/risk/portfolio")
async def get_portfolio_risk(request: Request):
    """Portfolio VaR, CVaR, and predefined stress scenarios."""
    user_id = _require_user_id(request)
    holdings = await _load_enriched_holdings(user_id)
    return await compute_portfolio_risk(holdings)


@router.post("/risk/portfolio/stress")
async def post_portfolio_stress(request: Request, body: PortfolioStressRequest):
    """Run portfolio risk with custom shock definitions."""
    user_id = _require_user_id(request)
    holdings = await _load_enriched_holdings(user_id)
    custom = [s.model_dump() for s in body.shocks]
    return await compute_portfolio_risk(holdings, custom_shocks=custom)
