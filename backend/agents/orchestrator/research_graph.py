"""LangGraph research subgraph — tool gather + six research agents."""
from __future__ import annotations

import asyncio
import logging
from typing import Callable, Optional

from langgraph.graph import END, START, StateGraph

from agents.base import build_analysis_context, require_cerebras_client
from agents.orchestrator.state import AnalysisState
from agents.research_runner import (
    build_research_brief,
    extract_red_team_signals,
    run_research_agents,
)
from agents.tools.edgar_tool import fetch_and_index_edgar
from agents.tools.esg_tool import fetch_and_index_esg
from agents.tools.insider_tool import fetch_and_index_insider
from agents.tools.options_tool import fetch_and_index_options
from agents.tools.peer_tool import fetch_and_index_peers
from services.retrieval_service import format_retrieved_sources

logger = logging.getLogger(__name__)


async def gather_tool_data(state: AnalysisState) -> dict:
    """Fetch insider/options/esg/peer/edgar tools in parallel."""
    ticker = state.get("ticker", "").upper()
    market_data = state.get("market_data") or {}
    company_name = market_data.get("full_name")
    on_log = state.get("on_log")

    if on_log:
        await on_log({"agent": "SYSTEM", "message": f"Gathering research tools for {ticker}..."})

    chunks = list(state.get("retrieved_chunks") or [])

    async def _safe(coro, label: str):
        try:
            return await coro
        except Exception as exc:
            logger.warning("%s tool failed for %s: %s", label, ticker, exc)
            return []

    results = await asyncio.gather(
        _safe(fetch_and_index_edgar(ticker, form="10-Q"), "10-Q"),
        _safe(fetch_and_index_edgar(ticker, form="8-K"), "8-K"),
        _safe(fetch_and_index_insider(ticker), "insider"),
        _safe(fetch_and_index_options(ticker), "options"),
        _safe(fetch_and_index_esg(ticker, company_name), "esg"),
        _safe(fetch_and_index_peers(ticker), "peers"),
        return_exceptions=False,
    )
    for batch in results:
        chunks.extend(batch)

    seen = {c.get("chunk_id") for c in state.get("retrieved_chunks") or []}
    unique = []
    for c in chunks:
        cid = c.get("chunk_id")
        if cid and cid in seen:
            continue
        if cid:
            seen.add(cid)
        unique.append(c)

    all_chunks = list(state.get("retrieved_chunks") or []) + unique
    sources = format_retrieved_sources(all_chunks)
    return {
        "retrieved_chunks": all_chunks,
        "retrieved_sources": sources,
        "valid_chunk_ids": {c["chunk_id"] for c in all_chunks if c.get("chunk_id")},
    }


async def run_research_agents_node(state: AnalysisState) -> dict:
    """Invoke six LLM research agents."""
    payload = await run_research_agents(
        ticker=state.get("ticker", ""),
        market_data=state.get("market_data") or {},
        retrieved_chunks=state.get("retrieved_chunks") or [],
        retrieved_sources=state.get("retrieved_sources") or "",
        scenario=state.get("scenario") or {},
        on_log=state.get("on_log"),
    )
    return payload


async def merge_research_node(state: AnalysisState) -> dict:
    """Finalize research brief and red-team signals."""
    research_results = state.get("research_results") or {}
    red_team_signals = state.get("red_team_signals") or extract_red_team_signals(research_results)
    brief = state.get("research_brief") or build_research_brief(research_results, red_team_signals)
    return {"research_brief": brief, "red_team_signals": red_team_signals}


def build_research_graph():
    builder = StateGraph(AnalysisState)
    builder.add_node("gather_tool_data", gather_tool_data)
    builder.add_node("run_research_agents", run_research_agents_node)
    builder.add_node("merge_research", merge_research_node)
    builder.add_edge(START, "gather_tool_data")
    builder.add_edge("gather_tool_data", "run_research_agents")
    builder.add_edge("run_research_agents", "merge_research")
    builder.add_edge("merge_research", END)
    return builder.compile()


_research_graph = None


def get_research_graph():
    global _research_graph
    if _research_graph is None:
        _research_graph = build_research_graph()
    return _research_graph


async def run_research_pass(
    *,
    ticker: str,
    market_data: dict,
    scenario: dict,
    retrieved_chunks: list | None = None,
    retrieved_sources: str | None = None,
    on_log: Optional[Callable] = None,
) -> dict:
    """Run full research subgraph; returns state patch dict."""
    graph = get_research_graph()
    initial: AnalysisState = {
        "ticker": ticker.upper(),
        "market_data": market_data,
        "scenario": scenario,
        "retrieved_chunks": retrieved_chunks or [],
        "retrieved_sources": retrieved_sources or "RETRIEVED_SOURCES: (none)",
        "on_log": on_log,
        "client": require_cerebras_client(),
    }
    return await graph.ainvoke(initial)


run_research_subgraph = run_research_pass
