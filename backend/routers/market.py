"""
/api/market — Live market data endpoints
"""
from fastapi import APIRouter, HTTPException
from services.market_service import get_market_data, ASSET_CONFIG
from services.news_service import get_news_events

router = APIRouter()


@router.get("/market/{ticker}")
async def get_ticker_data(ticker: str):
    """
    Fetch live price, change%, and 30-day volatility for an asset.
    Cached in Redis for 60 seconds.
    """
    try:
        data = await get_market_data(ticker.upper())
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/{ticker}/news")
async def get_ticker_news(ticker: str, limit: int = 5):
    """
    Fetch live news events for an asset.
    Returns events in the same schema as MOCK_EVENTS in frontend.
    """
    try:
        events = await get_news_events(ticker.upper(), limit=limit)
        return {"ticker": ticker.upper(), "events": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/assets/list")
async def list_assets():
    """List all supported assets."""
    return {
        "assets": [
            {"key": k, "full_name": v["full_name"], "asset_class": v["asset_class"]}
            for k, v in ASSET_CONFIG.items()
        ]
    }
