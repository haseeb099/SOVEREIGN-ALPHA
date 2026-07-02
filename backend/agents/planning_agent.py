"""Master planning agent — NL goal to structured workflow plan."""
from __future__ import annotations

import asyncio
import json
import re

from agents.base import _call_agent, require_cerebras_client
from services.market_service import search_market_tickers

SYSTEM_PROMPT = """You are the Planning Agent on the Sovereign-Alpha investment platform.
Convert a natural-language due diligence goal into a structured execution plan.
Output ONLY valid JSON with this structure:
{
  "ticker": "TSLA",
  "goal_summary": "Brief summary of the requested analysis",
  "steps": [
    {"id": "fetch_edgar", "tool": "edgar", "params": {"form": "10-K"}},
    {"id": "web_search", "tool": "web_search", "params": {"query": "TSLA risks 2026"}},
    {"id": "analyze", "tool": "analysis_pipeline"},
    {"id": "report", "tool": "generate_report", "params": {"template": "due_diligence"}}
  ],
  "requires_hitl": ["fetch_edgar", "analyze", "report"]
}
Resolve ticker from the goal when possible. Always include edgar, web_search, analysis_pipeline, and generate_report steps."""


def _default_plan(goal: str, ticker: str) -> dict:
    return {
        "ticker": ticker,
        "goal_summary": goal[:200],
        "steps": [
            {"id": "fetch_edgar", "tool": "edgar", "params": {"form": "10-K"}},
            {"id": "fetch_10q", "tool": "edgar", "params": {"form": "10-Q"}},
            {"id": "fetch_8k", "tool": "edgar", "params": {"form": "8-K"}},
            {"id": "insider", "tool": "insider"},
            {"id": "options", "tool": "options"},
            {"id": "esg", "tool": "esg"},
            {"id": "peers", "tool": "peers"},
            {
                "id": "web_search",
                "tool": "web_search",
                "params": {"query": f"{ticker} investment risks outlook 2026"},
            },
            {"id": "research_agents", "tool": "research_agents"},
            {"id": "analyze", "tool": "analysis_pipeline"},
            {"id": "report", "tool": "generate_report", "params": {"template": "due_diligence"}},
        ],
        "requires_hitl": ["fetch_edgar", "analyze", "report"],
    }


def _extract_ticker(goal: str) -> str:
    skip = {"DO", "FULL", "THE", "AND", "FOR", "ON", "DD", "DUE"}
    for match in re.finditer(r"\b([A-Z]{1,5})\b", goal.upper()):
        t = match.group(1)
        if t not in skip:
            return t
    return ""


async def run_planning(goal: str, prior_analyses: str | None = None) -> dict:
    """Run planning agent and return structured plan JSON."""
    from cerebras_config import CEREBRAS_API_KEY

    if not CEREBRAS_API_KEY:
        ticker = _extract_ticker(goal)
        if not ticker:
            matches = await search_market_tickers(goal[:40], limit=1)
            if matches:
                ticker = (matches[0].get("ticker") or matches[0].get("symbol") or "").upper()
        return _default_plan(goal, ticker or "UNKNOWN")

    client = require_cerebras_client()
    loop = asyncio.get_event_loop()
    user_msg = f"Goal: {goal}"
    if prior_analyses:
        user_msg += f"\n\n{prior_analyses}"

    try:
        plan = await loop.run_in_executor(None, _call_agent, client, SYSTEM_PROMPT, user_msg)
    except Exception:
        ticker = _extract_ticker(goal)
        return _default_plan(goal, ticker)

    ticker = (plan.get("ticker") or "").upper()
    if not ticker:
        ticker = _extract_ticker(goal)
    if not ticker:
        try:
            matches = await search_market_tickers(goal[:40], limit=1)
            if matches:
                ticker = (matches[0].get("ticker") or matches[0].get("symbol") or "").upper()
        except Exception:
            pass
    if not ticker:
        return _default_plan(goal, "UNKNOWN")

    plan["ticker"] = ticker
    if not plan.get("steps"):
        return _default_plan(goal, ticker)
    return plan
