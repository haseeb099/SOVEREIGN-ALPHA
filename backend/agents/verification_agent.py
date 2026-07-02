"""Verification agent — cross-check analysis outputs and tool results."""
from __future__ import annotations

import asyncio
import json

from agents.base import _call_agent, build_agent_trace, require_cerebras_client
from services.consistency_service import run_consistency_checks

SYSTEM_PROMPT = """You are the Verification Agent on the Sovereign-Alpha investment platform.
Cross-check all agent outputs, memo, and tool results for contradictions and grounding issues.
Output ONLY valid JSON:
{
  "passed": true,
  "contradictions": ["list of specific contradiction warnings"],
  "confidence_adjustment": 0.0,
  "recommendation": "proceed|revise|insufficient_data",
  "log_message": "One-line verification summary"
}
Be strict about bull vs bear target divergence, rating vs upside mismatch, and uncited claims."""


async def run_verification(
    analysis_result: dict,
    *,
    tool_outputs: list | None = None,
    retrieved_chunks: list | None = None,
) -> dict:
    """Run verification LLM + consistency rules; return verification payload."""
    consistency = run_consistency_checks(
        analysis_result,
        retrieved_chunks=retrieved_chunks or [],
    )

    research_results = (analysis_result.get("research_results") or {})
    esg = research_results.get("esg") or research_results.get("esg_compliance") or {}
    raw_esg = (analysis_result.get("raw_agents") or {}).get("esg") or {}
    sanctions_claim = esg.get("sanctions_hit")
    if sanctions_claim is not None:
        for out in tool_outputs or []:
            if out.get("tool") == "esg":
                tool_sanctioned = (out.get("summary") or {}).get("sanctions", {}).get("sanctioned")
                if tool_sanctioned is not None and bool(tool_sanctioned) != bool(sanctions_claim):
                    consistency.append(
                        "ESG agent sanctions_hit inconsistent with OpenSanctions tool output"
                    )
    if raw_esg.get("sanctions_hit") is not None and esg.get("sanctions_hit") is not None:
        if bool(raw_esg.get("sanctions_hit")) != bool(esg.get("sanctions_hit")):
            consistency.append("ESG sanctions flag mismatch between raw_agents and research_results")

    client = require_cerebras_client()
    loop = asyncio.get_event_loop()
    context = json.dumps(
        {
            "memo": analysis_result.get("memo"),
            "raw_agents": analysis_result.get("raw_agents"),
            "research_brief": analysis_result.get("research_brief"),
            "research_results": analysis_result.get("research_results"),
            "thesis_points": analysis_result.get("thesis_points"),
            "tool_outputs": tool_outputs or [],
            "existing_warnings": consistency,
        },
        indent=2,
    )[:12000]

    try:
        llm_result = await loop.run_in_executor(
            None, _call_agent, client, SYSTEM_PROMPT, f"Verify this analysis:\n{context}"
        )
    except Exception as e:
        llm_result = {
            "passed": len(consistency) == 0,
            "contradictions": consistency,
            "confidence_adjustment": 0.0,
            "recommendation": "proceed" if not consistency else "revise",
            "log_message": f"Verification fallback (LLM error: {e})",
        }

    contradictions = list(consistency)
    for c in llm_result.get("contradictions") or []:
        if c not in contradictions:
            contradictions.append(c)

    trace = build_agent_trace(
        "verification",
        {
            "confidence": max(0, 10 - len(contradictions)),
            "insufficient_data": llm_result.get("recommendation") == "insufficient_data",
            "citations": [],
            "log_message": llm_result.get("log_message", "Verification complete"),
            "reasoning_steps": contradictions[:5] or ["No contradictions detected"],
        },
    )
    trace["agent"] = "VERIFICATION"

    return {
        "passed": bool(llm_result.get("passed", not contradictions)),
        "contradictions": contradictions,
        "audit_warnings": contradictions,
        "confidence_adjustment": float(llm_result.get("confidence_adjustment") or 0),
        "recommendation": llm_result.get("recommendation", "proceed"),
        "trace": trace,
    }
