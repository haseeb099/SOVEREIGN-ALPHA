"""
/api/analyze — Main analysis endpoint
Triggers the full 5-agent pipeline for a given asset + scenario.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import asyncio

from services.market_service import get_market_data
from agents.pipeline import run_analysis_pipeline
from routers.telemetry import broadcast_log
from services.persistence_service import save_analysis

router = APIRouter()


class ScenarioInput(BaseModel):
    margins: float = Field(18.5, ge=5, le=35, description="Operating margins %")
    rates: float = Field(4.5, ge=0, le=10, description="Interest rate %")
    regulatory: str = Field("Low", description="Low | Medium | High")
    sentiment: str = Field("Neutral", description="Bullish | Neutral | Bearish")


class AnalyzeRequest(BaseModel):
    ticker: str = Field(..., description="Asset key: TSLA, BTC, XAU, EUR")
    scenario: ScenarioInput = ScenarioInput()
    thesis_points: Optional[list] = None  # Pre-existing thesis from document ingestion


@router.post("/analyze")
async def analyze_asset(request: AnalyzeRequest):
    """
    Run the full 5-agent AI pipeline for an asset.
    Returns structured memo, thesis tracker state, and verdict.
    
    Typical response time: 3-6 seconds on Cerebras WSE-3.
    """
    try:
        # Fetch live market data
        market_data = await get_market_data(request.ticker.upper())

        result = await run_analysis_pipeline(
            ticker=request.ticker.upper(),
            market_data=market_data,
            scenario=request.scenario.model_dump(),
            thesis_points=request.thesis_points,
            on_log=broadcast_log,
        )

        await save_analysis(request.ticker.upper(), request.scenario.model_dump(), result)

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")
