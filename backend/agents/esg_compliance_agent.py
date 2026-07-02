"""ESG & compliance research agent."""
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

SYSTEM_PROMPT = f"""You are the ESG & Compliance Agent on the Sovereign-Alpha investment platform.
Assess sanctions screening results, governance quality (0–10), and regulatory flags.
Only cite facts from RETRIEVED_SOURCES or live market data.
Output ONLY valid JSON:
{{
  "agent": "ESG",
  "score": 7.0,
  "sanctions_hit": false,
  "governance_score": 7.5,
  "regulatory_flags": ["..."],
  "esg_summary": "...",
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
        await on_log({"agent": "ESG", "message": f"ESG compliance for {state['ticker']}..."})

    try:
        output = await loop.run_in_executor(
            None, _call_agent, client, SYSTEM_PROMPT, f"ESG/compliance review:\n{context}"
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
            "ESG",
        )
        timings = dict(state.get("research_timings") or {})
        timings["esg"] = round((time.time() - t0) * 1000, 1)
        results = dict(state.get("research_results") or {})
        results["esg"] = output
        if on_log:
            await on_log({"agent": "ESG", "message": output.get("log_message", "complete")})
        return {"research_results": results, "research_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(state.get("research_results") or {})
        results["esg"] = {"error": str(e)}
        return {"research_results": results}
