"""
/api/analyze — Main analysis endpoint
Triggers the full 5-agent pipeline for a given asset + scenario.
"""
import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agents.pipeline import run_analysis_pipeline
from middleware.auth import extract_user_id
from routers.telemetry import broadcast_log
from routers.alerts import evaluate_rules_for_ticker, evaluate_rules_for_user
from services.market_service import get_market_data
from services.persistence_service import save_analysis, save_health_snapshot
from services.polygon_service import get_earnings_calendar
from services.sovereign_score_service import attach_sovereign_score
from services.valuation_engine import apply_to_memo

router = APIRouter()
_batch_semaphore = asyncio.Semaphore(3)


class ScenarioInput(BaseModel):
    margins: float = Field(18.5, ge=5, le=35, description="Operating margins %")
    rates: float = Field(4.5, ge=0, le=10, description="Interest rate %")
    regulatory: str = Field("Low", description="Low | Medium | High")
    sentiment: str = Field("Neutral", description="Bullish | Neutral | Bearish")


class AnalyzeRequest(BaseModel):
    ticker: str = Field(..., description="Asset ticker symbol")
    scenario: ScenarioInput = ScenarioInput()
    thesis_points: Optional[list] = None


class BatchAnalyzeRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=10)
    scenario: ScenarioInput = ScenarioInput()


async def _run_analyze(request: AnalyzeRequest, user_id: str | None = None) -> dict:
    market_data = await get_market_data(request.ticker.upper())
    result = await run_analysis_pipeline(
        ticker=request.ticker.upper(),
        market_data=market_data,
        scenario=request.scenario.model_dump(),
        thesis_points=request.thesis_points,
        on_log=broadcast_log,
    )
    bull = (result.get("raw_agents") or {}).get("bull")
    red = (result.get("raw_agents") or {}).get("red_team")
    result["memo"] = apply_to_memo(result["memo"], market_data.get("price", 0), bull, red)
    result = attach_sovereign_score(result, market_data)
    result["last_updated"] = result.get("timestamp")
    earnings = await get_earnings_calendar(request.ticker.upper())
    if earnings:
        result["earnings_overlay"] = earnings
    await save_analysis(request.ticker.upper(), request.scenario.model_dump(), result, user_id=user_id)
    await save_health_snapshot(request.ticker.upper(), result, user_id=user_id)
    fired = await evaluate_rules_for_ticker(
        request.ticker.upper(),
        user_id=None,
        latest_analysis=result,
    )
    if fired:
        result["alert_notifications"] = fired
    return result


@router.post("/analyze")
async def analyze_asset(request: AnalyzeRequest, http_request: Request):
    try:
        user_id = extract_user_id(http_request) or getattr(http_request.state, "user_id", None)
        return await _run_analyze(request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")


@router.post("/analyze/preview")
async def analyze_preview_alias(request: AnalyzeRequest):
    """Alias to scenario preview — fast deterministic recalc."""
    from routers.scenario import PreviewRequest, preview_scenario

    return await preview_scenario(
        PreviewRequest(ticker=request.ticker, scenario=request.scenario)
    )


@router.post("/analyze/batch")
async def analyze_batch(body: BatchAnalyzeRequest, req: Request):
    user_id = extract_user_id(req) or getattr(req.state, "user_id", None)

    async def _one(ticker: str):
        async with _batch_semaphore:
            req_single = AnalyzeRequest(ticker=ticker, scenario=body.scenario)
            return await _run_analyze(req_single, user_id)

    results = await asyncio.gather(*[_one(t) for t in body.tickers], return_exceptions=True)
    out = []
    for ticker, res in zip(body.tickers, results):
        if isinstance(res, Exception):
            out.append({"ticker": ticker.upper(), "error": str(res)})
        else:
            out.append(res)
    return {"results": out}
