"""LangGraph compilation for analysis subgraph and full workflow."""
from __future__ import annotations

import os
import time
from typing import Callable, Optional

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agents import bull_agent, fundamental_agent, macro_agent, red_team_agent, synthesis_agent
from agents.base import build_agent_trace, derive_rating, require_cerebras_client
from agents.orchestrator import nodes as workflow_nodes
from agents.orchestrator.state import AnalysisState, WorkflowState

_analysis_graph = None
_checkpointer: MemorySaver | None = None

CHECKPOINT_TTL = int(os.environ.get("WORKFLOW_CHECKPOINT_TTL_SECONDS", "3600"))


def get_checkpointer() -> MemorySaver:
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = MemorySaver()
    return _checkpointer


def _init_analysis_state_fields(state: AnalysisState) -> AnalysisState:
    """Ensure derived fields exist before agent nodes run."""
    retrieved_chunks = state.get("retrieved_chunks") or []
    market_data = state.get("market_data") or {}
    if "client" not in state:
        state["client"] = require_cerebras_client()
    if "valid_chunk_ids" not in state:
        state["valid_chunk_ids"] = {c["chunk_id"] for c in retrieved_chunks if c.get("chunk_id")}
    if "has_market" not in state:
        state["has_market"] = float(market_data.get("price") or 0) > 0
    if "context" not in state:
        from agents.base import build_analysis_context

        state["context"] = build_analysis_context(
            state.get("ticker", ""),
            market_data,
            state.get("scenario") or {},
            state.get("retrieved_sources") or "RETRIEVED_SOURCES: (none)",
            state.get("thesis_points"),
            state.get("prior_analyses"),
            research_brief=state.get("research_brief"),
            red_team_signals=state.get("red_team_signals"),
        )
    if "results" not in state:
        state["results"] = {}
    if "agent_timings" not in state:
        state["agent_timings"] = {}
    if "pipeline_audit" not in state:
        state["pipeline_audit"] = []
    if "start_time" not in state:
        state["start_time"] = time.time()
    return state


async def _run_research_wrapper(state: AnalysisState) -> dict:
    """Run Phase 20 research subgraph when enable_research is True."""
    if not state.get("enable_research", True):
        return {}
    from agents.orchestrator.research_graph import run_research_pass

    result = await run_research_pass(
        ticker=state.get("ticker", ""),
        market_data=state.get("market_data") or {},
        scenario=state.get("scenario") or {},
        retrieved_chunks=state.get("retrieved_chunks") or [],
        retrieved_sources=state.get("retrieved_sources"),
        on_log=state.get("on_log"),
    )
    chunks = result.get("retrieved_chunks") or state.get("retrieved_chunks") or []
    from agents.base import build_analysis_context

    context = build_analysis_context(
        state.get("ticker", ""),
        state.get("market_data") or {},
        state.get("scenario") or {},
        result.get("retrieved_sources") or state.get("retrieved_sources") or "",
        state.get("thesis_points"),
        state.get("prior_analyses"),
        research_brief=result.get("research_brief"),
        red_team_signals=result.get("red_team_signals"),
    )
    return {
        "retrieved_chunks": chunks,
        "retrieved_sources": result.get("retrieved_sources") or state.get("retrieved_sources"),
        "research_brief": result.get("research_brief", ""),
        "research_results": result.get("research_results") or {},
        "research_traces": result.get("research_traces") or [],
        "red_team_signals": result.get("red_team_signals") or {},
        "pipeline_audit": list(state.get("pipeline_audit") or [])
        + list(result.get("pipeline_audit") or []),
        "context": context,
        "valid_chunk_ids": {c["chunk_id"] for c in chunks if c.get("chunk_id")},
    }


async def _fundamental_wrapper(state: AnalysisState) -> dict:
    return await fundamental_agent.run(_init_analysis_state_fields(dict(state)))


async def _macro_wrapper(state: AnalysisState) -> dict:
    return await macro_agent.run(_init_analysis_state_fields(dict(state)))


async def _bull_wrapper(state: AnalysisState) -> dict:
    return await bull_agent.run(_init_analysis_state_fields(dict(state)))


async def _red_team_wrapper(state: AnalysisState) -> dict:
    return await red_team_agent.run(_init_analysis_state_fields(dict(state)))


async def _synthesis_wrapper(state: AnalysisState) -> dict:
    return await synthesis_agent.run(_init_analysis_state_fields(dict(state)))


def finalize_analysis_state(state: AnalysisState) -> dict:
    """Convert terminal analysis state into legacy pipeline return shape."""
    results = state.get("results") or state.get("agent_results") or {}
    market_data = state.get("market_data") or {}
    scenario = state.get("scenario") or {}
    thesis_points = state.get("thesis_points")
    retrieved_chunks = state.get("retrieved_chunks") or []
    agent_timings = state.get("agent_timings") or {}
    pipeline_audit = list(state.get("pipeline_audit") or [])
    ticker = state.get("ticker", "")
    start_time = state.get("start_time") or time.time()
    elapsed = round(time.time() - start_time, 2)

    synthesis = results.get("synthesis", {})
    bull = results.get("bull", {})
    red_team = results.get("red_team", {})

    agent_traces = []
    research_traces = state.get("research_traces") or []
    for key in ("fundamental", "macro", "bull", "red_team", "synthesis"):
        if key in results and "error" not in results[key]:
            agent_traces.append(build_agent_trace(key, results[key], agent_timings.get(key)))

    price = float(market_data.get("price", 0) or 0)
    target = float(synthesis.get("price_target") or bull.get("price_target", 0) or 0)
    confidence = float(synthesis.get("confidence_score", 5.0) or 5.0)
    if synthesis.get("insufficient_data"):
        confidence = min(confidence, 4.0)
    health = confidence * 10
    rating = synthesis.get("rating") or derive_rating(price, target, health)
    if rating == "INSUFFICIENT_DATA":
        rating = "NEUTRAL"

    resolved_thesis = synthesis.get("thesis_points") or thesis_points or []
    if not resolved_thesis:
        bull_verdict = synthesis.get("bull_verdict") or bull.get("verdict", "")
        if bull_verdict:
            resolved_thesis = [
                {
                    "id": 1,
                    "text": bull_verdict[:240],
                    "metric": "Bull catalyst",
                    "status": "PENDING",
                }
            ]

    memo_audit = list(synthesis.get("audit_warnings") or [])
    memo_audit.extend(pipeline_audit)

    raw_agents = dict(results)
    research_results = state.get("research_results") or {}
    for k, v in research_results.items():
        raw_agents[k] = v

    return {
        "ticker": ticker,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "asset_price": market_data.get("price", 0),
        "asset_change_pct": market_data.get("change_pct", 0),
        "volatility_30d": market_data.get("volatility_30d", 0),
        "scenario": scenario,
        "pipeline_elapsed_seconds": elapsed,
        "memo": {
            "bull_verdict": synthesis.get("bull_verdict") or bull.get("verdict", ""),
            "bear_verdict": synthesis.get("bear_verdict") or red_team.get("verdict", ""),
            "summary": synthesis.get("summary", ""),
            "price_target": target,
            "confidence_band": bull.get("confidence_band", [0, 0]),
            "rating": rating,
            "confidence_score": confidence,
            "audit_warnings": memo_audit,
            "distribution": synthesis.get("distribution"),
            "insufficient_data": bool(synthesis.get("insufficient_data", False)),
        },
        "thesis_points": resolved_thesis,
        "agent_traces": agent_traces,
        "retrieved_chunk_count": len(retrieved_chunks),
        "agent_logs": [],
        "raw_agents": raw_agents,
        "research_brief": state.get("research_brief", ""),
        "research_results": state.get("research_results") or {},
        "research_traces": research_traces,
    }


async def _finalize_analysis_node(state: AnalysisState) -> dict:
    payload = finalize_analysis_state(state)
    on_log = state.get("on_log")
    if on_log:
        await on_log(
            {
                "agent": "SYSTEM",
                "message": (
                    f"Full 5-agent pipeline completed in {payload['pipeline_elapsed_seconds']}s "
                    "at ~1,650 tok/s (Cerebras WSE-3)"
                ),
            }
        )
    return {"pipeline_result": payload}


def build_analysis_graph(*, enable_research: bool = True):
    builder = StateGraph(AnalysisState)
    if enable_research:
        builder.add_node("run_research", _run_research_wrapper)
    builder.add_node("fundamental", _fundamental_wrapper)
    builder.add_node("macro", _macro_wrapper)
    builder.add_node("bull", _bull_wrapper)
    builder.add_node("red_team", _red_team_wrapper)
    builder.add_node("synthesis", _synthesis_wrapper)
    builder.add_node("finalize", _finalize_analysis_node)

    if enable_research:
        builder.add_edge(START, "run_research")
        builder.add_edge("run_research", "fundamental")
    else:
        builder.add_edge(START, "fundamental")
    builder.add_edge("fundamental", "macro")
    builder.add_edge("macro", "bull")
    builder.add_edge("bull", "red_team")
    builder.add_edge("red_team", "synthesis")
    builder.add_edge("synthesis", "finalize")
    builder.add_edge("finalize", END)
    return builder.compile()


def get_analysis_graph(*, enable_research: bool = True):
    return build_analysis_graph(enable_research=enable_research)


async def run_analysis_graph(
    *,
    ticker: str,
    market_data: dict,
    scenario: dict,
    thesis_points: Optional[list] = None,
    retrieved_chunks: Optional[list] = None,
    retrieved_sources: Optional[str] = None,
    prior_analyses: str = "",
    on_log: Optional[Callable] = None,
    enable_research: bool = True,
) -> dict:
    """Run analysis subgraph; returns pipeline-compatible dict."""
    graph = get_analysis_graph(enable_research=enable_research)
    initial: AnalysisState = {
        "ticker": ticker.upper(),
        "market_data": market_data,
        "scenario": scenario,
        "thesis_points": thesis_points,
        "retrieved_chunks": retrieved_chunks or [],
        "retrieved_sources": retrieved_sources or "RETRIEVED_SOURCES: (none)",
        "prior_analyses": prior_analyses,
        "on_log": on_log,
        "start_time": time.time(),
        "enable_research": enable_research,
    }
    final_state = await graph.ainvoke(initial)
    if final_state.get("pipeline_result"):
        return final_state["pipeline_result"]
    return finalize_analysis_state(final_state)


# Alias for compatibility
run_analysis_subgraph = run_analysis_graph


def build_workflow_graph(*, auto_approve: bool = False):
    builder = StateGraph(WorkflowState)
    builder.add_node("planning", workflow_nodes.plan_node)
    builder.add_node("fetch_tools", workflow_nodes.fetch_tools_node)
    builder.add_node("load_memory", workflow_nodes.load_memory_node)
    builder.add_node("run_analysis", workflow_nodes.run_analysis_node)
    builder.add_node("verify", workflow_nodes.verify_node)
    builder.add_node("generate_report", workflow_nodes.generate_report_node)
    builder.add_node("finalize", workflow_nodes.finalize_node)

    builder.add_edge(START, "planning")
    builder.add_edge("planning", "fetch_tools")
    builder.add_edge("fetch_tools", "load_memory")
    builder.add_edge("load_memory", "run_analysis")
    builder.add_edge("run_analysis", "verify")
    builder.add_edge("verify", "generate_report")
    builder.add_edge("generate_report", "finalize")
    builder.add_edge("finalize", END)

    interrupt_before = []
    if not auto_approve:
        interrupt_before = ["fetch_tools", "run_analysis", "generate_report"]

    return builder.compile(
        checkpointer=get_checkpointer(),
        interrupt_before=interrupt_before,
    )


def get_workflow_graph(*, auto_approve: bool = False):
    return build_workflow_graph(auto_approve=auto_approve)
