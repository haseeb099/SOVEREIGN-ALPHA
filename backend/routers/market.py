"""
/api/market — Live market data endpoints
"""
from fastapi import APIRouter, HTTPException, Query

from services.market_service import ASSET_CONFIG, get_history, get_market_data, search_market
from services.massive_flatfiles_service import (
    KNOWN_PREFIXES,
    MassiveFlatfilesError,
    check_connection,
    flatfiles_configured,
    list_objects,
    peek_object,
)
from services.news_service import get_news_events
from services.polygon_service import get_earnings_calendar

router = APIRouter()


@router.get("/market/search")
async def search_tickers_endpoint(q: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=50)):
    """Search tickers via Polygon with local fallback."""
    from services.polygon_service import PolygonRateLimitError

    try:
        results = await search_market(q, limit=limit)
    except PolygonRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    return {"query": q, "results": results}


@router.get("/market/assets/list")
async def list_assets():
    """List all supported assets."""
    return {
        "assets": [
            {"key": k, "full_name": v["full_name"], "asset_class": v["asset_class"]}
            for k, v in ASSET_CONFIG.items()
        ]
    }


@router.get("/market/flatfiles/status")
async def flatfiles_status():
    """Check Massive.com S3 flat files connectivity (separate from Polygon REST API)."""
    status = await check_connection()
    return {
        **status,
        "configured": flatfiles_configured(),
        "known_prefixes": KNOWN_PREFIXES,
    }


@router.get("/market/flatfiles/list")
async def flatfiles_list(
    prefix: str = Query("", description="S3 key prefix, e.g. us_stocks_sip/day_aggs_v1"),
    limit: int = Query(20, ge=1, le=100),
):
    """List objects in the Massive flat files bucket."""
    try:
        objects = await list_objects(prefix=prefix, max_keys=limit)
    except MassiveFlatfilesError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"prefix": prefix, "bucket": "flatfiles", "objects": objects}


@router.get("/market/flatfiles/peek")
async def flatfiles_peek(key: str = Query(..., min_length=1)):
    """Preview the first lines of a flat file object (gzipped CSV supported)."""
    try:
        preview = await peek_object(key)
    except MassiveFlatfilesError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return preview


@router.get("/market/{ticker}/history")
async def get_ticker_history(ticker: str, range: str = Query("1y", alias="range")):
    """OHLCV price history for charting."""
    history = await get_history(ticker.upper(), range_key=range)
    return {"ticker": ticker.upper(), "range": range, "bars": history}


@router.get("/market/{ticker}/news")
async def get_ticker_news(ticker: str, limit: int = 5):
    """Fetch live news events for an asset."""
    try:
        events = await get_news_events(ticker.upper(), limit=limit)
        return {"ticker": ticker.upper(), "events": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/{ticker}/earnings")
async def get_ticker_earnings(ticker: str):
    """Earnings calendar stub via Polygon."""
    events = await get_earnings_calendar(ticker.upper())
    return {"ticker": ticker.upper(), "earnings": events}


@router.get("/market/{ticker}")
async def get_ticker_data(ticker: str):
    """Fetch live price, change%, and 30-day volatility for an asset."""
    try:
        data = await get_market_data(ticker.upper())
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
