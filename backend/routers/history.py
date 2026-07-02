"""GET /api/history — thesis health time-series and diffs (tenant-scoped)."""
from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import select

from database import AsyncSessionLocal
from models import ThesisHealthSnapshot
from services.persistence_service import get_analysis_history
from services.permission_service import get_org_id, require_permission

router = APIRouter()


@router.get("/history/{ticker}")
async def analysis_history(
    ticker: str,
    request: Request,
    limit: int = Query(20, ge=1, le=100),
):
    user_id = require_permission(request, "thesis:read")
    org_id = get_org_id(request)
    items = await get_analysis_history(
        ticker, limit=limit, user_id=user_id, org_id=org_id
    )
    return {"ticker": ticker.upper(), "count": len(items), "items": items}


@router.get("/history/{ticker}/health")
async def health_history(
    ticker: str,
    request: Request,
    range: str = Query("90d"),
):
    user_id = require_permission(request, "thesis:read")
    org_id = get_org_id(request)
    days = {"30d": 30, "60d": 60, "90d": 90}.get(range, 90)
    try:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(ThesisHealthSnapshot)
                .where(ThesisHealthSnapshot.ticker == ticker.upper())
                .where(ThesisHealthSnapshot.user_id == user_id)
            )
            if org_id:
                stmt = stmt.where(
                    (ThesisHealthSnapshot.org_id == org_id)
                    | (ThesisHealthSnapshot.org_id.is_(None))
                )
            rows = (
                await session.execute(
                    stmt.order_by(ThesisHealthSnapshot.created_at.desc()).limit(days)
                )
            ).scalars().all()
            points = [
                {
                    "score": r.score,
                    "target": r.target,
                    "status": r.status,
                    "distribution": r.distribution,
                    "created_at": r.created_at.isoformat(),
                }
                for r in reversed(rows)
            ]
            return {"ticker": ticker.upper(), "range": range, "points": points}
    except Exception:
        return {"ticker": ticker.upper(), "range": range, "points": []}


@router.get("/history/{ticker}/diff")
async def analysis_diff(ticker: str, request: Request):
    user_id = require_permission(request, "thesis:read")
    org_id = get_org_id(request)
    items = await get_analysis_history(
        ticker, limit=2, user_id=user_id, org_id=org_id
    )
    if len(items) < 2:
        raise HTTPException(status_code=404, detail="Need at least 2 analyses for diff")
    current, prior = items[0], items[1]
    return {
        "ticker": ticker.upper(),
        "current": current,
        "prior": prior,
        "target_delta": (current.get("memo") or {}).get("price_target", 0)
        - (prior.get("memo") or {}).get("price_target", 0),
    }
