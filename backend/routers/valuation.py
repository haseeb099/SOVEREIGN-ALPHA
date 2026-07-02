"""Valuation & Risk Laboratory API routes."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.dcf_agent import generate_dcf_assumptions
from agents.comps_valuation_agent import generate_comps_overrides
from services.comps_engine import run_comps
from services.dcf_engine import run_dcf
from services.financials_service import fetch_financial_snapshot
from services.lbo_engine import run_lbo
from services.market_service import get_market_data
from services.monte_carlo_service import run_monte_carlo
from services.sensitivity_service import build_sensitivity_grid, parse_nl_financial_scenario
from services.valuation_lab_service import build_valuation_lab_snapshot

router = APIRouter()


class DcfRequest(BaseModel):
    assumptions: Optional[dict[str, Any]] = None
    use_agent: bool = False
    research_context: str = ""


class CompsRequest(BaseModel):
    peers: Optional[list[dict[str, Any]]] = None
    use_agent: bool = False
    research_context: str = ""


class LboRequest(BaseModel):
    assumptions: Optional[dict[str, Any]] = None


class MonteCarloRequest(BaseModel):
    config: Optional[dict[str, Any]] = None
    base_assumptions: Optional[dict[str, Any]] = None


class SensitivityRequest(BaseModel):
    assumptions: Optional[dict[str, Any]] = None
    row_axis: str = "wacc"
    col_axis: str = "terminal_growth"


class GenerateRequest(BaseModel):
    use_llm: bool = Field(False, description="Run DCF + comps agents in parallel")
    research_results: Optional[dict[str, Any]] = None


class NLFinancialScenarioRequest(BaseModel):
    text: str = Field(..., min_length=3)
    mode: str = Field("financial", description="financial | macro")


async def _with_price(financials: dict[str, Any], ticker: str) -> dict[str, Any]:
    fin = dict(financials)
    if not fin.get("current_price"):
        try:
            market = await get_market_data(ticker)
            fin["current_price"] = market.get("price")
        except Exception:
            pass
    return fin


@router.get("/valuation/{ticker}/financials")
async def get_financials(ticker: str):
    snapshot = await fetch_financial_snapshot(ticker.upper())
    return snapshot


@router.post("/valuation/{ticker}/dcf")
async def post_dcf(ticker: str, body: DcfRequest):
    symbol = ticker.upper()
    financials = await _with_price(await fetch_financial_snapshot(symbol), symbol)
    if financials.get("insufficient_data"):
        raise HTTPException(status_code=422, detail=financials.get("message") or "Insufficient financial data")

    assumptions = body.assumptions or {}
    if body.use_agent:
        agent = await generate_dcf_assumptions(symbol, financials, body.research_context)
        if agent.get("assumptions"):
            assumptions = {**agent["assumptions"], **assumptions}

    return run_dcf(financials, assumptions, current_price=financials.get("current_price"))


@router.post("/valuation/{ticker}/comps")
async def post_comps(ticker: str, body: CompsRequest):
    symbol = ticker.upper()
    financials = await _with_price(await fetch_financial_snapshot(symbol), symbol)
    peers = body.peers
    if body.use_agent:
        agent = await generate_comps_overrides(symbol, financials, body.peers, body.research_context)
        if agent.get("peer_overrides"):
            peers = [{"ticker": t} for t in agent["peer_overrides"]] + (peers or [])
    return await run_comps(symbol, financials, peers=peers)


@router.post("/valuation/{ticker}/lbo")
async def post_lbo(ticker: str, body: LboRequest):
    symbol = ticker.upper()
    financials = await fetch_financial_snapshot(symbol)
    if financials.get("insufficient_data"):
        raise HTTPException(status_code=422, detail=financials.get("message") or "LBO requires equity financials")
    return run_lbo(financials, body.assumptions)


@router.post("/valuation/{ticker}/monte-carlo")
async def post_monte_carlo(ticker: str, body: MonteCarloRequest):
    symbol = ticker.upper()
    financials = await _with_price(await fetch_financial_snapshot(symbol), symbol)
    config = dict(body.config or {})
    if body.base_assumptions:
        config["base_assumptions"] = body.base_assumptions
    return run_monte_carlo(financials, config, current_price=financials.get("current_price"))


@router.post("/valuation/{ticker}/sensitivity")
async def post_sensitivity(ticker: str, body: SensitivityRequest):
    symbol = ticker.upper()
    financials = await _with_price(await fetch_financial_snapshot(symbol), symbol)
    return build_sensitivity_grid(
        financials,
        body.assumptions,
        row_axis=body.row_axis,
        col_axis=body.col_axis,
        current_price=financials.get("current_price"),
    )


@router.post("/valuation/{ticker}/generate")
async def post_generate(ticker: str, body: GenerateRequest):
    """Run-all: agents (optional) + deterministic engines."""
    return await build_valuation_lab_snapshot(
        ticker.upper(),
        use_llm=body.use_llm,
        research_results=body.research_results,
    )


@router.post("/valuation/nl-scenario")
async def post_nl_financial_scenario(body: NLFinancialScenarioRequest):
    """Parse NL into financial DCF assumptions (rule-based fast path)."""
    if body.mode != "financial":
        from services.valuation_engine import parse_nl_scenario
        return parse_nl_scenario(body.text)
    return parse_nl_financial_scenario(body.text)
