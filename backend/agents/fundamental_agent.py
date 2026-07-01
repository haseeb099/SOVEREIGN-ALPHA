"""Fundamental analysis agent."""
from __future__ import annotations

import asyncio
import time

from agents.base import (
    _CITATION_FIELDS,
    _apply_insufficient_data_rule,
    _call_agent,
    validate_citations,
)
from agents.orchestrator.state import AnalysisState

SYSTEM_PROMPT = f"""You are the Fundamental Analysis Agent on the Sovereign-Alpha investment platform.
Your role: Analyze the raw financial metrics of an asset given a scenario configuration.
Only cite facts present in the RETRIEVED_SOURCES block or live market data in context.
Output ONLY valid JSON with this structure:
{{
  "agent": "FUNDAMENTAL",
  "score": 7.2,
  "margin_assessment": "...",
  "rate_sensitivity": "...",
  "regulatory_outlook": "...",
  "key_metrics": {{"pe_ratio": "...", "revenue_growth": "...", "debt_to_equity": "..."}},
{_CITATION_FIELDS}
  "log_message": "One-line summary of your analysis for the telemetry log"
}}"""


async def run(state: AnalysisState) -> dict:
    loop = asyncio.get_event_loop()
    client = state["client"]
    context = state["context"]
    t0 = time.time()
    on_log = state.get("on_log")
    if on_log:
        await on_log({"agent": "FUNDAMENTAL", "message": f"Running fundamental agent for {state['ticker']}..."})

    try:
        output = await loop.run_in_executor(
            None, _call_agent, client, SYSTEM_PROMPT, f"Analyze fundamentals:\n{context}"
        )
        output = _apply_insufficient_data_rule(
            output, len(state.get("retrieved_chunks") or []), state.get("has_market", False)
        )
        audit = list(state.get("pipeline_audit") or [])
        output = validate_citations(
            output,
            state.get("valid_chunk_ids") or set(),
            state.get("retrieved_chunks") or [],
            audit,
            "FUNDAMENTAL",
        )
        timings = dict(state.get("agent_timings") or {})
        timings["fundamental"] = round((time.time() - t0) * 1000, 1)
        results = dict(state.get("results") or {})
        results["fundamental"] = output
        if on_log:
            await on_log({"agent": "FUNDAMENTAL", "message": output.get("log_message", "fundamental complete")})
        return {"results": results, "agent_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(state.get("results") or {})
        results["fundamental"] = {"error": str(e)}
        if on_log:
            await on_log({"agent": "FUNDAMENTAL", "message": f"ERROR: {e}"})
        return {"results": results}
