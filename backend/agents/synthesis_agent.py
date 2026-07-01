"""Synthesis agent — final investment verdict."""
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

SYSTEM_PROMPT = f"""You are the Synthesis Agent on the Sovereign-Alpha investment platform.
You have received analysis from Fundamental, Macro, Bull, and Red Team agents.
Your role: Synthesize all inputs into a final structured investment verdict.
Only cite facts from RETRIEVED_SOURCES or agent outputs with valid citations.
If insufficient verified sources, set insufficient_data=true and rating may be NEUTRAL.
Output ONLY valid JSON with this structure:
{{
  "agent": "SYNTHESIS",
  "rating": "BULLISH|NEUTRAL|BEARISH|INSUFFICIENT_DATA",
  "confidence_score": 7.5,
  "summary": "3-4 sentence executive summary of the overall investment case",
  "bull_verdict": "2 sentence bull case for display",
  "bear_verdict": "2 sentence bear case for display",
  "price_target": 220.00,
  "distribution": {{
    "bear": {{"price": 165.0, "probability": 0.20}},
    "base": {{"price": 210.0, "probability": 0.55}},
    "bull": {{"price": 285.0, "probability": 0.25}}
  }},
  "thesis_points": [
    {{"id": 1, "text": "...", "metric": "Margins", "status": "PASS|RISK|FAIL", "current_value": "19.2%", "threshold": "18%"}}
  ],
  "audit_warnings": ["Optional list of integrity warnings"],
{_CITATION_FIELDS}
  "log_message": "Final synthesis complete — rating: BULLISH"
}}

Rating calibration (required):
- BULLISH: 12M upside ≥ 15% vs spot AND thesis health ≥ 50
- BEARISH: upside ≤ -10% OR thesis health < 30
- NEUTRAL: otherwise
- INSUFFICIENT_DATA: when insufficient_data is true
Set rating from upside and confidence_score (health proxy = confidence_score × 10)."""


async def run(state: AnalysisState) -> dict:
    loop = asyncio.get_event_loop()
    client = state["client"]
    context = state["context"]
    results = state.get("results") or {}
    thesis_points = state.get("thesis_points")
    t0 = time.time()
    on_log = state.get("on_log")
    if on_log:
        await on_log(
            {"agent": "SYNTHESIS", "message": "Synthesizing all agent outputs into final verdict..."}
        )

    all_context = f"""
Context:\n{context}

Fundamental Agent Output:\n{json.dumps(results.get('fundamental', {}), indent=2)}
Macro Agent Output:\n{json.dumps(results.get('macro', {}), indent=2)}
Bull Agent Output:\n{json.dumps(results.get('bull', {}), indent=2)}
Red Team Agent Output:\n{json.dumps(results.get('red_team', {}), indent=2)}
"""
    if thesis_points:
        all_context += f"\nOriginal Thesis Points to Grade:\n{json.dumps(thesis_points, indent=2)}"

    try:
        output = await loop.run_in_executor(None, _call_agent, client, SYSTEM_PROMPT, all_context)
        output = _apply_insufficient_data_rule(
            output, len(state.get("retrieved_chunks") or []), state.get("has_market", False)
        )
        audit = list(state.get("pipeline_audit") or [])
        output = validate_citations(
            output,
            state.get("valid_chunk_ids") or set(),
            state.get("retrieved_chunks") or [],
            audit,
            "SYNTHESIS",
        )
        timings = dict(state.get("agent_timings") or {})
        timings["synthesis"] = round((time.time() - t0) * 1000, 1)
        results = dict(results)
        results["synthesis"] = output
        if on_log:
            await on_log({"agent": "SYNTHESIS", "message": output.get("log_message", "Pipeline complete")})
        return {"results": results, "agent_timings": timings, "pipeline_audit": audit}
    except Exception as e:
        results = dict(results)
        results["synthesis"] = {"error": str(e)}
        if on_log:
            await on_log({"agent": "SYNTHESIS", "message": f"ERROR: {e}"})
        return {"results": results}
