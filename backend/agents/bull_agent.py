"""Bull case agent."""
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

SYSTEM_PROMPT = f"""You are the Bull Case Agent on the Sovereign-Alpha investment platform.
Your role: Build the strongest possible bull case for this asset. Be specific with catalysts and targets.
Only cite facts from RETRIEVED_SOURCES or live market data — do not invent metrics.
Output ONLY valid JSON with this structure:
{{
  "agent": "BULL",
  "verdict": "Two to three sentence bull thesis",
  "price_target": 240.00,
  "confidence_band": [210, 270],
  "key_catalysts": ["Catalyst 1", "Catalyst 2", "Catalyst 3"],
  "time_horizon": "12-18 months",
  "factor_weights": {{"margins": 0.35, "fsd": 0.25, "rates": 0.20}},
{_CITATION_FIELDS}
  "log_message": "One-line summary for telemetry"
}}"""


async def run(state: AnalysisState) -> dict:
    loop = asyncio.get_event_loop()
    client = state["client"]
    context = state["context"]
    t0 = time.time()
    on_log = state.get("on_log")
    if on_log:
        await on_log({"agent": "BULL", "message": f"Running bull agent for {state['ticker']}..."})

    try:
        output = await loop.run_in_executor(
            None, _call_agent, client, SYSTEM_PROMPT, f"Build bull case:\n{context}"
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
            "BULL",
        )
        timings = dict(state.get("agent_timings") or {})
        timings["bull"] = round((time.time() - t0) * 1000, 1)
        results = dict(state.get("results") or {})
        results["bull"] = output
        if on_log:
            await on_log({"agent": "BULL", "message": output.get("log_message", "bull complete")})
        return {"results": results, "agent_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(state.get("results") or {})
        results["bull"] = {"error": str(e)}
        if on_log:
            await on_log({"agent": "BULL", "message": f"ERROR: {e}"})
        return {"results": results}
