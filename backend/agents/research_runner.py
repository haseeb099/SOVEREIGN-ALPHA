"""Parallel runner for six Phase 20 research agents."""
from __future__ import annotations

import asyncio
from typing import Callable, Optional

from agents import (
    company_research_agent,
    competitive_analysis_agent,
    esg_compliance_agent,
    insider_sentiment_agent,
    options_flow_agent,
    sector_macro_research_agent,
)
from agents.base import build_agent_trace, build_analysis_context, require_cerebras_client
from agents.orchestrator.state import AnalysisState

_RESEARCH_AGENTS = (
    ("company_research", company_research_agent),
    ("sector_macro", sector_macro_research_agent),
    ("competitive", competitive_analysis_agent),
    ("esg", esg_compliance_agent),
    ("insider", insider_sentiment_agent),
    ("options_flow", options_flow_agent),
)

_RESEARCH_SEMAPHORE = asyncio.Semaphore(2)

RESEARCH_AGENT_KEYS = tuple(k for k, _ in _RESEARCH_AGENTS)


def _merge_state(base: AnalysisState, patch: dict) -> AnalysisState:
    merged = dict(base)
    for key, val in patch.items():
        if key in ("research_results", "research_timings", "pipeline_audit") and key in merged:
            inner = dict(merged.get(key) or {})
            inner.update(val or {})
            merged[key] = inner
        else:
            merged[key] = val
    return merged


def build_research_brief(research_results: dict, red_team_signals: dict | None = None) -> str:
    """Format consolidated RESEARCH_BRIEF block for downstream prompts."""
    lines = ["RESEARCH_BRIEF:"]
    for key, data in research_results.items():
        if not isinstance(data, dict) or "error" in data:
            continue
        summary = (
            data.get("log_message")
            or data.get("verdict")
            or data.get("insider_summary")
            or data.get("esg_summary")
            or data.get("unusual_activity")
            or data.get("competitive_position")
            or data.get("financials_summary")
            or data.get("industry_trends")
        )
        if summary:
            lines.append(f"- {key.upper()}: {summary}")
    if red_team_signals:
        insider = red_team_signals.get("insider_sentiment")
        options = red_team_signals.get("options_flow")
        if insider:
            lines.append(f"- INSIDER_SIGNAL: {insider}")
        if options:
            lines.append(f"- OPTIONS_SIGNAL: {options}")
    return "\n".join(lines)


def extract_red_team_signals(research_results: dict) -> dict:
    """Condense insider + options outputs for red team injection."""
    insider = research_results.get("insider") or {}
    options = research_results.get("options_flow") or {}
    signals: dict = {}
    if insider and "error" not in insider:
        signals["insider_sentiment"] = (
            insider.get("insider_summary")
            or insider.get("log_message")
            or f"Net sentiment: {insider.get('net_sentiment', 'unknown')}"
        )
    if options and "error" not in options:
        signals["options_flow"] = (
            options.get("unusual_activity")
            or options.get("log_message")
            or f"Signal: {options.get('signal', 'neutral')}"
        )
    return signals


async def run_research_agents(
    ticker: str,
    market_data: dict,
    retrieved_chunks: list,
    *,
    retrieved_sources: str = "",
    scenario: dict | None = None,
    research_brief: str = "",
    on_log: Optional[Callable] = None,
) -> dict:
    """
    Run six research agents concurrently.
    Returns research_brief, research_results, research_traces, extra_chunks, red_team_signals.
    """
    scenario = scenario or {}
    valid_chunk_ids = {c["chunk_id"] for c in retrieved_chunks if c.get("chunk_id")}
    client = require_cerebras_client()
    context = build_analysis_context(
        ticker,
        market_data,
        scenario,
        retrieved_sources or "RETRIEVED_SOURCES: (none)",
        research_brief=research_brief or None,
    )
    base_state: AnalysisState = {
        "ticker": ticker.upper(),
        "market_data": market_data,
        "scenario": scenario,
        "retrieved_chunks": retrieved_chunks,
        "retrieved_sources": retrieved_sources,
        "context": context,
        "client": client,
        "valid_chunk_ids": valid_chunk_ids,
        "has_market": float(market_data.get("price") or 0) > 0,
        "on_log": on_log,
        "research_results": {},
        "research_timings": {},
        "pipeline_audit": [],
    }

    async def _run_one(_key: str, module):
        async with _RESEARCH_SEMAPHORE:
            return await module.run(base_state)

    results_list = await asyncio.gather(
        *[_run_one(k, m) for k, m in _RESEARCH_AGENTS],
        return_exceptions=True,
    )

    merged_results: dict = {}
    merged_timings: dict = {}
    audit: list = []
    for patch in results_list:
        if isinstance(patch, Exception):
            continue
        merged_results.update(patch.get("research_results") or {})
        merged_timings.update(patch.get("research_timings") or {})
        audit.extend(patch.get("pipeline_audit") or [])

    red_team_signals = extract_red_team_signals(merged_results)
    brief = build_research_brief(merged_results, red_team_signals)

    traces = []
    for key, _ in _RESEARCH_AGENTS:
        if key in merged_results and "error" not in merged_results[key]:
            trace = build_agent_trace(key, merged_results[key], merged_timings.get(key))
            if key == "options_flow":
                trace["agent"] = "OPTIONS_FLOW"
            elif key == "sector_macro":
                trace["agent"] = "SECTOR_MACRO"
            elif key == "company_research":
                trace["agent"] = "COMPANY_RESEARCH"
            elif key == "competitive":
                trace["agent"] = "COMPETITIVE"
            elif key == "esg":
                trace["agent"] = "ESG"
            elif key == "insider":
                trace["agent"] = "INSIDER"
            traces.append(trace)

    return {
        "research_brief": brief,
        "research_results": merged_results,
        "research_traces": traces,
        "red_team_signals": red_team_signals,
        "extra_chunks": [],
        "pipeline_audit": audit,
        "research_timings": merged_timings,
    }
