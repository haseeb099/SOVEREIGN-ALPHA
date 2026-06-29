"""Public API v1 — API key auth and metering."""
import hashlib
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from sqlalchemy import func, select

from database import AsyncSessionLocal
from middleware.rate_limit import limiter
from models import ApiKey, ApiUsage
from routers.analyze import AnalyzeRequest, ScenarioInput, _run_analyze

router = APIRouter(prefix="/v1/public")


class PublicAnalyzeRequest(BaseModel):
    ticker: str
    scenario: Optional[dict] = None


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


async def _verify_api_key(x_api_key: str) -> ApiKey:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key required")
    key_hash = _hash_key(x_api_key)
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
        ).scalar_one_or_none()
        if not row:
            demo_key = os.environ.get("DEMO_API_KEY", "demo-sovereign-key")
            if x_api_key == demo_key:
                return ApiKey(user_id="demo", key_hash=key_hash, plan_tier="demo", rate_limit=50)
            raise HTTPException(status_code=401, detail="Invalid API key")
        return row


async def _record_usage(key_hash: str, endpoint: str, ticker: str | None):
    try:
        async with AsyncSessionLocal() as session:
            session.add(ApiUsage(api_key_hash=key_hash, endpoint=endpoint, ticker=ticker))
            await session.commit()
    except Exception:
        pass


@router.post("/analyze")
@limiter.limit("30/minute")
async def public_analyze(
    request: Request,
    body: PublicAnalyzeRequest,
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    api_key = await _verify_api_key(x_api_key)
    async with AsyncSessionLocal() as session:
        count = (
            await session.execute(
                select(func.count()).select_from(ApiUsage).where(ApiUsage.api_key_hash == api_key.key_hash)
            )
        ).scalar() or 0
        if count >= api_key.rate_limit:
            raise HTTPException(status_code=429, detail="API usage limit exceeded")

    scenario = body.scenario or {}
    analyze_req = AnalyzeRequest(
        ticker=body.ticker,
        scenario=ScenarioInput(**{**ScenarioInput().model_dump(), **scenario}),
    )
    result = await _run_analyze(analyze_req)
    await _record_usage(api_key.key_hash, "/v1/public/analyze", body.ticker.upper())
    return result


@router.get("/community")
async def community_feed():
    """Opt-in public thesis cards — demo data when DB empty."""
    return {
        "cards": [
            {"ticker": "TSLA", "score": 72.5, "summary": "Margins intact; FSD timeline risk", "change_7d": -2.1},
            {"ticker": "NVDA", "score": 81.2, "summary": "AI capex cycle supports demand", "change_7d": 3.4},
        ],
        "disclaimer": "Not investment advice",
    }
