"""Competitive analysis agent — structured peer matrix."""
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

SYSTEM_PROMPT = f"""You are the Competitive Analysis Agent on the Sovereign-Alpha investment platform.
Build a structured peer comparison matrix (3–5 peers): revenue growth, margins, valuation, market share.
Only cite facts from RETRIEVED_SOURCES or live market data.
Output ONLY valid JSON:
{{
  "agent": "COMPETITIVE",
  "score": 6.8,
  "subject_ticker": "TSLA",
  "peer_matrix": [
    {{
      "ticker": "RIVN",
      "name": "Rivian",
      "revenue_growth_pct": 12.5,
      "gross_margin_pct": 8.2,
      "operating_margin_pct": -15.0,
      "pe_ratio": null,
      "market_share_pct": 2.1
    }}
  ],
  "competitive_position": "...",
  "verdict": "...",
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
        await on_log({"agent": "COMPETITIVE", "message": f"Competitive analysis for {state['ticker']}..."})

    try:
        output = await loop.run_in_executor(
            None, _call_agent, client, SYSTEM_PROMPT, f"Competitive analysis:\n{context}"
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
            "COMPETITIVE",
        )
        timings = dict(state.get("research_timings") or {})
        timings["competitive"] = round((time.time() - t0) * 1000, 1)
        results = dict(state.get("research_results") or {})
        results["competitive"] = output
        if on_log:
            await on_log({"agent": "COMPETITIVE", "message": output.get("log_message", "complete")})
        return {"research_results": results, "research_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(state.get("research_results") or {})
        results["competitive"] = {"error": str(e)}
        return {"research_results": results}
