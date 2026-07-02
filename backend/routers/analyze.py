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
from middleware.rbac import is_read_only_role
from routers.telemetry import broadcast_log
from routers.alerts import evaluate_rules_for_ticker, evaluate_rules_for_user
from services.audit_service import record_event
from services.permission_service import get_org_id, get_org_role
from services.market_service import get_market_data
from services.persistence_service import save_analysis, save_health_snapshot
from services.polygon_service import get_earnings_overlay
from services.retrieval_service import (
    format_retrieved_sources,
    index_market_snapshot,
    retrieve,
)
from services.sovereign_score_service import attach_sovereign_score
from services.valuation_engine import apply_to_memo
from services.corpus_service import get_corpus_detail
from services.consistency_service import run_consistency_checks
from services.valuation_lab_service import build_valuation_lab_snapshot

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
    corpus_id: Optional[str] = None
    document_ids: Optional[list[str]] = None
    enable_research: bool = Field(True, description="Run Phase 20 research agents before core pipeline")
    enable_valuation_lab: bool = Field(False, description="Attach valuation lab snapshot after analysis")


class BatchAnalyzeRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=10)
    scenario: ScenarioInput = ScenarioInput()


async def _run_analyze(request: AnalyzeRequest, user_id: str | None = None, org_id=None) -> dict:
    ticker = request.ticker.upper()
    market_data = await get_market_data(ticker)
    await index_market_snapshot(ticker, market_data)

    thesis_points = request.thesis_points
    document_ids = request.document_ids
    if request.corpus_id and user_id:
        corpus = await get_corpus_detail(request.corpus_id, user_id)
        if corpus:
            merged = corpus.get("merged_extraction") or {}
            if merged.get("thesis_points"):
                thesis_points = merged["thesis_points"]
            document_ids = corpus.get("document_ids") or document_ids

    filters: dict = {"source_types": ["document", "market", "filing"]}
    if document_ids:
        filters["document_ids"] = document_ids

    retrieved = await retrieve(
        ticker=ticker,
        query=f"investment thesis fundamentals risks {ticker}",
        filters=filters,
        top_k=12,
    )
    retrieved_sources = format_retrieved_sources(retrieved)
    result = await run_analysis_pipeline(
        ticker=ticker,
        market_data=market_data,
        scenario=request.scenario.model_dump(),
        thesis_points=thesis_points,
        retrieved_chunks=retrieved,
        retrieved_sources=retrieved_sources,
        on_log=broadcast_log,
        enable_research=request.enable_research,
    )
    bull = (result.get("raw_agents") or {}).get("bull")
    red = (result.get("raw_agents") or {}).get("red_team")
    result["memo"] = apply_to_memo(result["memo"], market_data.get("price", 0), bull, red)
    consistency_warnings = run_consistency_checks(result, retrieved_chunks=retrieved)
    existing = result["memo"].get("audit_warnings") or []
    result["memo"]["audit_warnings"] = existing + consistency_warnings
    result = attach_sovereign_score(result, market_data)
    if request.enable_valuation_lab:
        try:
            research = result.get("research_results") or {}
            result["valuation_lab"] = await build_valuation_lab_snapshot(
                ticker,
                use_llm=False,
                research_results=research,
            )
        except Exception:
            pass
    result["last_updated"] = result.get("timestamp")
    earnings = await get_earnings_overlay(request.ticker.upper())
    if earnings:
        result["earnings_overlay"] = earnings
    await save_analysis(
        request.ticker.upper(),
        request.scenario.model_dump(),
        result,
        user_id=user_id,
        org_id=org_id,
    )
    await save_health_snapshot(request.ticker.upper(), result, user_id=user_id, org_id=org_id)
    await record_event(
        org_id=org_id,
        actor_id=user_id,
        action="analyze.complete",
        resource_type="thesis_analysis",
        resource_id=request.ticker.upper(),
        payload={
            "rating": (result.get("memo") or {}).get("rating"),
            "sovereign_score": result.get("sovereign_score"),
            "agent_verdicts": {
                k: (v or {}).get("verdict") or (v or {}).get("log_message")
                for k, v in (result.get("raw_agents") or {}).items()
            },
        },
    )
    fired = await evaluate_rules_for_ticker(
        request.ticker.upper(),
        user_id=user_id,
        latest_analysis=result,
    )
    if fired:
        result["alert_notifications"] = fired
    return result


@router.post("/analyze")
async def analyze_asset(request: AnalyzeRequest, http_request: Request):
    try:
        user_id = extract_user_id(http_request) or getattr(http_request.state, "user_id", None)
        org_id = get_org_id(http_request)
        role = get_org_role(http_request)
        if is_read_only_role(role):
            raise HTTPException(status_code=403, detail="Viewer role cannot run analysis")
        return await asyncio.wait_for(
            _run_analyze(request, user_id, org_id=org_id),
            timeout=120,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Analysis timed out")
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
    org_id = get_org_id(req)
    role = get_org_role(req)
    if is_read_only_role(role):
        raise HTTPException(status_code=403, detail="Viewer role cannot run analysis")

    async def _one(ticker: str):
        async with _batch_semaphore:
            req_single = AnalyzeRequest(ticker=ticker, scenario=body.scenario)
            return await _run_analyze(req_single, user_id, org_id=org_id)

    results = await asyncio.gather(*[_one(t) for t in body.tickers], return_exceptions=True)
    out = []
    for ticker, res in zip(body.tickers, results):
        if isinstance(res, Exception):
            out.append({"ticker": ticker.upper(), "error": str(res)})
        else:
            out.append(res)
    return {"results": out}
