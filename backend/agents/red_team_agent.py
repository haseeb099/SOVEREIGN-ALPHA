"""Red team adversarial agent."""
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

SYSTEM_PROMPT = f"""You are the Red Team Adversarial Agent on the Sovereign-Alpha investment platform.
Your role: Attack the bull thesis. Find every flaw, risk, and assumption failure. Be institutional and specific.
Only cite facts from RETRIEVED_SOURCES or live market data.
Output ONLY valid JSON with this structure:
{{
  "agent": "RED_TEAM",
  "verdict": "Two to three sentence bear thesis attacking the bull case",
  "bear_price_target": 140.00,
  "key_risks": ["Risk 1", "Risk 2", "Risk 3"],
  "thesis_attack": "Specific argument against the bull catalyst",
  "factor_weights": {{"competition": 0.32, "margins": 0.28, "regulatory": 0.20}},
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
        await on_log({"agent": "RED_TEAM", "message": f"Running red_team agent for {state['ticker']}..."})

    try:
        user_msg = (
            f"Attack this bull case:\n{json.dumps(results.get('bull', {}))}\n\nContext:\n{context}"
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
            "RED_TEAM",
        )
        timings = dict(state.get("agent_timings") or {})
        timings["red_team"] = round((time.time() - t0) * 1000, 1)
        results = dict(results)
        results["red_team"] = output
        if on_log:
            await on_log({"agent": "RED_TEAM", "message": output.get("log_message", "red_team complete")})
        return {"results": results, "agent_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(results)
        results["red_team"] = {"error": str(e)}
        if on_log:
            await on_log({"agent": "RED_TEAM", "message": f"ERROR: {e}"})
        return {"results": results}
