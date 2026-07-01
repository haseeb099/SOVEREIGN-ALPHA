"""Workflow graph node functions: planning, tools, memory, HITL, analysis, verification."""
from __future__ import annotations

import json
import logging
import re
import uuid

from agents.planning_agent import run_planning
from agents.verification_agent import run_verification
from agents.orchestrator.state import WorkflowState
from agents.tools.edgar_tool import fetch_and_index_edgar
from agents.tools.web_search_tool import search_and_index_web
from routers.telemetry import broadcast_log
from services.agent_memory_service import load_thesis_evolution
from services.market_service import get_market_data, search_market_tickers
from services.retrieval_service import format_retrieved_sources, retrieve

logger = logging.getLogger(__name__)


def _extract_ticker_from_goal(goal: str) -> str | None:
    skip = {"DO", "FULL", "THE", "AND", "FOR", "ON", "DD", "DUE"}
    for match in re.finditer(r"\b([A-Z]{1,5})\b", goal.upper()):
        candidate = match.group(1)
        if candidate not in skip:
            return candidate
    return None


async def _workflow_log(state: WorkflowState, agent: str, message: str):
    wf_id = state.get("workflow_id")
    event = {"agent": agent, "message": message, "ts": 0}
    if wf_id:
        event["workflow_id"] = wf_id
    await broadcast_log(event)


async def plan_node(state: WorkflowState) -> dict:
    goal = state.get("goal", "")
    await _workflow_log(state, "PLANNING", f"Planning workflow for goal: {goal[:80]}")
    plan = await run_planning(goal, prior_analyses=state.get("prior_analyses"))
    ticker = (plan.get("ticker") or "").upper()
    if not ticker:
        ticker = _extract_ticker_from_goal(goal) or ""
    if not ticker:
        matches = await search_market_tickers(goal[:32], limit=1)
        if matches:
            ticker = (matches[0].get("ticker") or matches[0].get("symbol") or "").upper()
    if not ticker:
        return {"status": "failed", "error": "Could not resolve ticker from goal"}
    plan["ticker"] = ticker
    return {"plan": plan, "ticker": ticker, "status": "running"}


async def fetch_tools_node(state: WorkflowState) -> dict:
    ticker = state.get("ticker", "")
    plan = state.get("plan") or {}
    steps = plan.get("steps") or []
    chunks = list(state.get("retrieved_chunks") or [])
    tool_outputs: list[dict] = []

    for step in steps:
        tool = step.get("tool")
        params = step.get("params") or {}
        if tool == "edgar":
            form = params.get("form", "10-K")
            await _workflow_log(state, "TOOLS", f"Fetching {form} from SEC EDGAR for {ticker}")
            try:
                edgar_chunks = await fetch_and_index_edgar(ticker, form=form)
                chunks.extend(edgar_chunks)
                tool_outputs.append({"tool": "edgar", "chunks": len(edgar_chunks)})
            except Exception as e:
                logger.warning("EDGAR fetch failed: %s", e)
                tool_outputs.append({"tool": "edgar", "error": str(e)})
        elif tool == "web_search":
            query = params.get("query") or f"{ticker} investment risks outlook"
            await _workflow_log(state, "TOOLS", f"Web search: {query[:60]}")
            try:
                web_chunks = await search_and_index_web(ticker, query)
                chunks.extend(web_chunks)
                tool_outputs.append({"tool": "web_search", "chunks": len(web_chunks)})
            except Exception as e:
                logger.warning("Web search failed: %s", e)
                tool_outputs.append({"tool": "web_search", "error": str(e)})

    if not any(s.get("tool") in ("edgar", "web_search") for s in steps):
        try:
            edgar_chunks = await fetch_and_index_edgar(ticker)
            chunks.extend(edgar_chunks)
            web_chunks = await search_and_index_web(ticker, f"{ticker} due diligence risks 2026")
            chunks.extend(web_chunks)
        except Exception as e:
            logger.warning("Default tool fetch failed: %s", e)

    retrieved = await retrieve(
        ticker=ticker,
        query=f"investment thesis fundamentals risks {ticker}",
        filters={"source_types": ["document", "market", "filing", "news"]},
        top_k=12,
    )
    seen = {c.get("chunk_id") for c in chunks}
    for r in retrieved:
        if r.get("chunk_id") not in seen:
            chunks.append(r)

    sources = format_retrieved_sources(chunks)
    return {
        "retrieved_chunks": chunks,
        "retrieved_sources": sources,
        "tool_outputs": tool_outputs,
    }


async def load_memory_node(state: WorkflowState) -> dict:
    ticker = state.get("ticker", "")
    user_id = state.get("user_id")
    prior = await load_thesis_evolution(ticker, user_id, limit=3)
    return {"prior_analyses": prior}


async def run_analysis_node(state: WorkflowState) -> dict:
    import json

    ticker = state.get("ticker", "")
    scenario = state.get("scenario") or {
        "margins": 18.5,
        "rates": 4.5,
        "regulatory": "Low",
        "sentiment": "Neutral",
    }
    market_data = state.get("market_data")
    if not market_data:
        market_data = await get_market_data(ticker)

    from agents.orchestrator.graph import run_analysis_graph

    result = await run_analysis_graph(
        ticker=ticker,
        market_data=market_data,
        scenario=scenario,
        thesis_points=state.get("thesis_points"),
        retrieved_chunks=state.get("retrieved_chunks") or [],
        retrieved_sources=state.get("retrieved_sources"),
        prior_analyses=state.get("prior_analyses") or "",
        on_log=None,
    )
    safe_result = json.loads(json.dumps(result, default=str))
    return {"analysis_result": safe_result, "market_data": market_data, "pending_checkpoint": None}


async def verify_node(state: WorkflowState) -> dict:
    analysis = state.get("analysis_result") or {}
    verification = await run_verification(
        analysis,
        tool_outputs=state.get("tool_outputs") or [],
    )
    memo = dict((analysis.get("memo") or {}))
    warnings = list(memo.get("audit_warnings") or [])
    warnings.extend(verification.get("contradictions") or [])
    memo["audit_warnings"] = warnings
    analysis["memo"] = memo

    traces = list(analysis.get("agent_traces") or [])
    traces.append(verification.get("trace", {}))
    analysis["agent_traces"] = traces
    safe_analysis = json.loads(json.dumps(analysis, default=str))
    safe_verification = json.loads(json.dumps(verification, default=str))

    return {"verification": safe_verification, "analysis_result": safe_analysis}


async def generate_report_node(state: WorkflowState) -> dict:
    analysis = state.get("analysis_result") or {}
    ticker = state.get("ticker", "")
    user_id = state.get("user_id")

    try:
        from database import AsyncSessionLocal
        from models import Report
        import secrets
        from datetime import datetime, timezone

        share_token = secrets.token_urlsafe(32)
        report_id = uuid.uuid4()
        async with AsyncSessionLocal() as session:
            row = Report(
                id=report_id,
                user_id=user_id,
                ticker=ticker,
                share_token=share_token,
                payload=analysis,
                template="due_diligence",
            )
            session.add(row)
            await session.commit()
        return {"report_id": str(report_id)}
    except Exception as e:
        logger.warning("Report generation failed: %s", e)
        return {"report_id": None, "error": str(e)}


async def finalize_node(state: WorkflowState) -> dict:
    await _workflow_log(state, "SYSTEM", f"Workflow {state.get('workflow_id')} completed")
    return {"status": "completed", "pending_checkpoint": None}
