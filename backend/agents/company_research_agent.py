"""Company research agent — financials, management, moat."""
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

SYSTEM_PROMPT = f"""You are the Company Research Agent on the Sovereign-Alpha investment platform.
Analyze financials, management quality, economic moat, and competitive position.
Only cite facts from RETRIEVED_SOURCES or live market data.
Output ONLY valid JSON:
{{
  "agent": "COMPANY_RESEARCH",
  "score": 7.0,
  "financials_summary": "...",
  "management_quality": "...",
  "moat_assessment": "...",
  "competitive_position": "...",
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
        await on_log({"agent": "COMPANY_RESEARCH", "message": f"Company research for {state['ticker']}..."})

    try:
        output = await loop.run_in_executor(
            None, _call_agent, client, SYSTEM_PROMPT, f"Research company:\n{context}"
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
            "COMPANY_RESEARCH",
        )
        timings = dict(state.get("research_timings") or {})
        timings["company_research"] = round((time.time() - t0) * 1000, 1)
        results = dict(state.get("research_results") or {})
        results["company_research"] = output
        if on_log:
            await on_log({"agent": "COMPANY_RESEARCH", "message": output.get("log_message", "complete")})
        return {"research_results": results, "research_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(state.get("research_results") or {})
        results["company_research"] = {"error": str(e)}
        return {"research_results": results}
