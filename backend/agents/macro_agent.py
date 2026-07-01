"""Macro intelligence agent."""
from __future__ import annotations

import asyncio
import json
import time

from agents.base import (
    _CITATION_FIELDS,
    _apply_insufficient_data_rule,
    _call_agent,
    validate_citations,
)
from agents.orchestrator.state import AnalysisState

SYSTEM_PROMPT = f"""You are the Macro Intelligence Agent on the Sovereign-Alpha investment platform.
Your role: Cross-reference the current macroeconomic environment against the asset's thesis assumptions.
Only cite facts from RETRIEVED_SOURCES or provided market/scenario data.
Output ONLY valid JSON with this structure:
{{
  "agent": "MACRO",
  "macro_score": 6.5,
  "interest_rate_impact": "...",
  "inflation_context": "...",
  "dollar_strength_effect": "...",
  "geopolitical_risk": "Low|Medium|High",
{_CITATION_FIELDS}
  "log_message": "One-line summary for telemetry"
}}"""


async def run(state: AnalysisState) -> dict:
    loop = asyncio.get_event_loop()
    client = state["client"]
    context = state["context"]
    results = state.get("results") or {}
    t0 = time.time()
    on_log = state.get("on_log")
    if on_log:
        await on_log({"agent": "MACRO", "message": f"Running macro agent for {state['ticker']}..."})

    try:
        user_msg = (
            f"Macro analysis:\n{context}\n\n"
            f"Fundamental findings: {json.dumps(results.get('fundamental', {}))}"
        )
        output = await loop.run_in_executor(None, _call_agent, client, SYSTEM_PROMPT, user_msg)
        output = _apply_insufficient_data_rule(
            output, len(state.get("retrieved_chunks") or []), state.get("has_market", False)
        )
        audit = list(state.get("pipeline_audit") or [])
        output = validate_citations(
            output,
            state.get("valid_chunk_ids") or set(),
            state.get("retrieved_chunks") or [],
            audit,
            "MACRO",
        )
        timings = dict(state.get("agent_timings") or {})
        timings["macro"] = round((time.time() - t0) * 1000, 1)
        results = dict(results)
        results["macro"] = output
        if on_log:
            await on_log({"agent": "MACRO", "message": output.get("log_message", "macro complete")})
        return {"results": results, "agent_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(results)
        results["macro"] = {"error": str(e)}
        if on_log:
            await on_log({"agent": "MACRO", "message": f"ERROR: {e}"})
        return {"results": results}
