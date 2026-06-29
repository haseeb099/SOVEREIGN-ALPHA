"""Scenario preview and NL scenario endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from services.market_service import get_market_data
from services.valuation_engine import parse_nl_scenario, scenario_preview

router = APIRouter()


class ScenarioInput(BaseModel):
    margins: float = Field(18.5, ge=5, le=35)
    rates: float = Field(4.5, ge=0, le=10)
    regulatory: str = Field("Low")
    sentiment: str = Field("Neutral")


class PreviewRequest(BaseModel):
    ticker: str
    scenario: ScenarioInput
    base_analysis: Optional[dict] = None


class NLScenarioRequest(BaseModel):
    text: str = Field(..., min_length=3)


@router.post("/scenario/preview")
async def preview_scenario(request: PreviewRequest):
    """Deterministic scenario preview — no LLM, <100ms."""
    try:
        market = await get_market_data(request.ticker.upper())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    result = scenario_preview(
        request.ticker,
        market.get("price", 0),
        request.scenario.model_dump(),
        request.base_analysis,
    )
    return result


@router.post("/scenario/nl")
async def nl_scenario(request: NLScenarioRequest):
    """Parse natural language into structured scenario deltas."""
    parsed = parse_nl_scenario(request.text)
    return parsed
