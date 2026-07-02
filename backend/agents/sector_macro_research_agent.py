"""Sector & macro research agent — industry trends distinct from macro_agent."""
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

SYSTEM_PROMPT = f"""You are the Sector & Macro Research Agent on the Sovereign-Alpha investment platform.
Analyze industry trends, TAM, cycle stage, and sector-specific macro headwinds.
This is distinct from interest-rate macro scoring — focus on the industry.
Only cite facts from RETRIEVED_SOURCES or live market data.
Output ONLY valid JSON:
{{
  "agent": "SECTOR_MACRO",
  "score": 6.5,
  "industry_trends": "...",
  "tam_assessment": "...",
  "cycle_stage": "early|mid|late|recovery",
  "sector_headwinds": ["..."],
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
        await on_log({"agent": "SECTOR_MACRO", "message": f"Sector research for {state['ticker']}..."})

    try:
        output = await loop.run_in_executor(
            None, _call_agent, client, SYSTEM_PROMPT, f"Sector/macro research:\n{context}"
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
            "SECTOR_MACRO",
        )
        timings = dict(state.get("research_timings") or {})
        timings["sector_macro"] = round((time.time() - t0) * 1000, 1)
        results = dict(state.get("research_results") or {})
        results["sector_macro"] = output
        if on_log:
            await on_log({"agent": "SECTOR_MACRO", "message": output.get("log_message", "complete")})
        return {"research_results": results, "research_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(state.get("research_results") or {})
        results["sector_macro"] = {"error": str(e)}
        return {"research_results": results}
