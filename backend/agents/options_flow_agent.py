"""Options flow research agent."""
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

SYSTEM_PROMPT = f"""You are the Options Flow Agent on the Sovereign-Alpha investment platform.
Detect unusual call/put volume, strike clusters, and bearish/bullish signal strength.
Only cite facts from RETRIEVED_SOURCES or options data in context.
Output ONLY valid JSON:
{{
  "agent": "OPTIONS_FLOW",
  "score": 6.0,
  "signal": "bullish|bearish|neutral",
  "signal_strength": 6.0,
  "unusual_activity": "...",
  "strike_clusters": ["..."],
  "put_call_ratio": 0.85,
{_CITATION_FIELDS}
  "log_message": "One-line summary"
}}"""


async def run(state: AnalysisState) -> dict:
    loop = asyncio.get_event_loop()
    client = state["client"]
    context = state.get("context", "")
    t0 = time.time()
    on_log = state.get("on_log")
    if on_log:
        await on_log({"agent": "OPTIONS_FLOW", "message": f"Options flow for {state['ticker']}..."})

    try:
        output = await loop.run_in_executor(
            None, _call_agent, client, SYSTEM_PROMPT, f"Options flow analysis:\n{context}"
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
            "OPTIONS_FLOW",
        )
        timings = dict(state.get("research_timings") or {})
        timings["options_flow"] = round((time.time() - t0) * 1000, 1)
        results = dict(state.get("research_results") or {})
        results["options_flow"] = output
        if on_log:
            await on_log({"agent": "OPTIONS_FLOW", "message": output.get("log_message", "complete")})
        return {"research_results": results, "research_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(state.get("research_results") or {})
        results["options_flow"] = {"error": str(e)}
        return {"research_results": results}
