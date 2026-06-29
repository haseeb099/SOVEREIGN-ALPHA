"""GET /api/history — thesis health time-series and diffs."""
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from database import AsyncSessionLocal
from models import ThesisAnalysis, ThesisHealthSnapshot
from services.persistence_service import get_analysis_history

router = APIRouter()


@router.get("/history/{ticker}")
async def analysis_history(ticker: str, limit: int = Query(20, ge=1, le=100)):
    items = await get_analysis_history(ticker, limit=limit)
    return {"ticker": ticker.upper(), "count": len(items), "items": items}


@router.get("/history/{ticker}/health")
async def health_history(ticker: str, range: str = Query("90d")):
    days = {"30d": 30, "60d": 60, "90d": 90}.get(range, 90)
    try:
        async with AsyncSessionLocal() as session:
            rows = (
                await session.execute(
                    select(ThesisHealthSnapshot)
                    .where(ThesisHealthSnapshot.ticker == ticker.upper())
                    .order_by(ThesisHealthSnapshot.created_at.desc())
                    .limit(days)
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
async def analysis_diff(ticker: str):
    items = await get_analysis_history(ticker, limit=2)
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
