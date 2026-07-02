"""Public API v1 — API key auth and metering with plan tier enforcement."""
import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from sqlalchemy import func, select

from database import AsyncSessionLocal
from middleware.rate_limit import limiter
from models import ApiKey, ApiUsage
from routers.analyze import AnalyzeRequest, ScenarioInput, _run_analyze

router = APIRouter(prefix="/v1/public")

TIER_LIMITS = {
    "free": 50,
    "demo": 50,
    "pro": 10000,
    "enterprise": 100000,
}


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
                return ApiKey(
                    user_id="demo",
                    key_hash=key_hash,
                    plan_tier="demo",
                    rate_limit=TIER_LIMITS["demo"],
                )
            raise HTTPException(status_code=401, detail="Invalid API key")
        return row


async def _check_quota(api_key: ApiKey) -> None:
    tier = (api_key.plan_tier or "free").lower()
    limit = TIER_LIMITS.get(tier, api_key.rate_limit or 50)
    async with AsyncSessionLocal() as session:
        if tier == "enterprise":
            return
        if tier == "pro":
            month_start = datetime.now(timezone.utc).replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            count = (
                await session.execute(
                    select(func.count())
                    .select_from(ApiUsage)
                    .where(ApiUsage.api_key_hash == api_key.key_hash)
                    .where(ApiUsage.created_at >= month_start)
                )
            ).scalar() or 0
        else:
            count = (
                await session.execute(
                    select(func.count())
                    .select_from(ApiUsage)
                    .where(ApiUsage.api_key_hash == api_key.key_hash)
                )
            ).scalar() or 0
        if count >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"API usage limit exceeded for {tier} tier ({limit} calls)",
            )


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
    await _check_quota(api_key)
    tier = (api_key.plan_tier or "free").lower()
    enterprise_limit = os.environ.get("ENTERPRISE_API_RATE_LIMIT", "100000/month")
    rate = "120/minute" if tier == "enterprise" else "30/minute"

    scenario = body.scenario or {}
    analyze_req = AnalyzeRequest(
        ticker=body.ticker,
        scenario=ScenarioInput(**{**ScenarioInput().model_dump(), **scenario}),
    )
    result = await _run_analyze(analyze_req)
    if tier == "enterprise":
        result["priority_queue"] = True
        result["sla_tier"] = enterprise_limit
    await _record_usage(api_key.key_hash, "/v1/public/analyze", body.ticker.upper())
    return result


@router.get("/status")
async def public_status(x_api_key: str = Header(..., alias="X-API-Key")):
    api_key = await _verify_api_key(x_api_key)
    tier = (api_key.plan_tier or "free").lower()
    return {
        "status": "operational",
        "plan_tier": tier,
        "sla": {
            "uptime_target": "99.9%" if tier == "enterprise" else "99.5%",
            "support_response": "4h" if tier == "enterprise" else "best-effort",
        },
        "rate_limit": TIER_LIMITS.get(tier, api_key.rate_limit),
    }


@router.get("/community")
async def community_feed():
    """Opt-in public thesis cards — from seeded analyses when available."""
    from services.db_guard import db_skipped

    fallback = {
        "cards": [
            {"ticker": "TSLA", "score": 72.5, "summary": "Margins intact; FSD timeline risk", "change_7d": -2.1},
            {"ticker": "NVDA", "score": 81.2, "summary": "AI capex cycle supports demand", "change_7d": 3.4},
        ],
        "disclaimer": "Not investment advice",
    }
    if db_skipped():
        return fallback
    try:
        from sqlalchemy import select

        from models import ThesisAnalysis

        async with AsyncSessionLocal() as session:
            rows = (
                await session.execute(
                    select(ThesisAnalysis)
                    .order_by(ThesisAnalysis.created_at.desc())
                    .limit(6)
                )
            ).scalars().all()
        if not rows:
            return fallback
        cards = []
        for row in rows:
            memo = (row.result or {}).get("memo", {})
            summary = memo.get("summary") or memo.get("bull_verdict") or "Thesis analysis"
            cards.append(
                {
                    "ticker": row.ticker,
                    "score": row.sovereign_score or 0,
                    "summary": str(summary)[:120],
                    "change_7d": (row.result or {}).get("asset_change_pct"),
                }
            )
        return {"cards": cards, "disclaimer": "Not investment advice"}
    except Exception:
        return fallback
