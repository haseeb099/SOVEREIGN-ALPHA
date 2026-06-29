"""GET /api/history/{ticker} — retrieve persisted analysis runs."""
from fastapi import APIRouter, Query

from services.persistence_service import get_analysis_history

router = APIRouter()


@router.get("/history/{ticker}")
async def analysis_history(ticker: str, limit: int = Query(20, ge=1, le=100)):
    """Return prior thesis analysis runs for an asset, newest first."""
    items = await get_analysis_history(ticker, limit=limit)
    return {"ticker": ticker.upper(), "count": len(items), "items": items}
