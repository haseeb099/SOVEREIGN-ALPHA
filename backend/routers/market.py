"""
/api/market — Live market data endpoints
"""
from fastapi import APIRouter, HTTPException, Query

from services.calendar_service import get_calendar_events
from services.market_service import (
    ASSET_CONFIG,
    get_history,
    get_indicators,
    get_market_data,
    get_risk_metrics,
    search_market,
)
from services.massive_flatfiles_service import (
    KNOWN_PREFIXES,
    MassiveFlatfilesError,
    check_connection,
    flatfiles_configured,
    list_objects,
    peek_object,
)
from services.news_service import get_news_feed
from services.polygon_service import get_depth, get_earnings_calendar, PolygonRateLimitError

router = APIRouter()


@router.get("/market/search")
async def search_tickers_endpoint(q: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=50)):
    """Search tickers via Polygon with local fallback."""
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


@router.get("/market/calendar")
async def get_market_calendar(
    ticker: str | None = Query(None),
    days: int = Query(30, ge=1, le=365),
):
    """Upcoming earnings, Fed, and macro events."""
    events = await get_calendar_events(ticker=ticker, days=days)
    return {"ticker": ticker.upper() if ticker else None, "days": days, "events": events}


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
async def get_ticker_history(
    ticker: str,
    range: str = Query("1y", alias="range"),
    interval: str = Query("1d"),
):
    """OHLCV price history for charting."""
    history = await get_history(ticker.upper(), range_key=range, interval=interval)
    return {"ticker": ticker.upper(), "range": range, "interval": interval, "bars": history}


@router.get("/market/{ticker}/indicators")
async def get_ticker_indicators(ticker: str, range: str = Query("1y", alias="range")):
    """Technical indicators (RSI, MACD, Bollinger, volume SMA)."""
    indicators = await get_indicators(ticker.upper(), range_key=range)
    return {"ticker": ticker.upper(), "range": range, "indicators": indicators}


@router.get("/market/{ticker}/risk-metrics")
async def get_ticker_risk_metrics(
    ticker: str,
    range: str = Query("1y", alias="range"),
    benchmark: str = Query("SPY"),
):
    """Risk metrics: Sharpe, max drawdown, VaR 95%, beta."""
    try:
        metrics = await get_risk_metrics(ticker.upper(), range_key=range, benchmark=benchmark)
        return metrics
    except PolygonRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc))


@router.get("/market/{ticker}/depth")
async def get_ticker_depth(ticker: str):
    """Bid/ask depth snapshot from Polygon."""
    try:
        depth = await get_depth(ticker.upper())
        return depth
    except PolygonRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc))


@router.get("/market/{ticker}/news")
async def get_ticker_news(ticker: str, limit: int = 5):
    """Fetch live news events with per-article and aggregate sentiment."""
    try:
        feed = await get_news_feed(ticker.upper(), limit=limit)
        return {"ticker": ticker.upper(), **feed}
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
