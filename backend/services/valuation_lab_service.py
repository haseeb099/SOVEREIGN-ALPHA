"""Orchestrator for full valuation lab snapshot."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from agents.comps_valuation_agent import generate_comps_overrides
from agents.dcf_agent import generate_dcf_assumptions
from agents.tools.peer_tool import resolve_peers
from services.comps_engine import run_comps
from services.dcf_engine import default_dcf_assumptions, run_dcf
from services.financials_service import fetch_financial_snapshot
from services.lbo_engine import default_lbo_assumptions, run_lbo
from services.market_service import get_market_data
from services.monte_carlo_service import run_monte_carlo
from services.sensitivity_service import build_sensitivity_grid


async def build_valuation_lab_snapshot(
    ticker: str,
    *,
    use_llm: bool = False,
    research_results: dict[str, Any] | None = None,
    include_monte_carlo: bool = True,
    include_sensitivity: bool = True,
) -> dict[str, Any]:
    """Fetch financials, optionally run agents, run all engines."""
    symbol = ticker.upper()
    financials = await fetch_financial_snapshot(symbol)

    try:
        market = await get_market_data(symbol)
        if market.get("price"):
            financials["current_price"] = market["price"]
    except Exception:
        pass

    research_context = ""
    peer_matrix: list[dict] | None = None
    if research_results:
        competitive = research_results.get("competitive") or research_results.get("competitive_analysis") or {}
        peer_matrix = competitive.get("peer_matrix") or competitive.get("peers")
        research_context = str(research_results)[:4000]

    dcf_assumptions = default_dcf_assumptions(financials)
    agent_notes: dict[str, str] = {}
    peers = peer_matrix

    if use_llm:
        dcf_task = generate_dcf_assumptions(symbol, financials, research_context)
        comps_task = generate_comps_overrides(symbol, financials, peer_matrix, research_context)
        dcf_agent_result, comps_agent_result = await asyncio.gather(dcf_task, comps_task)
        if dcf_agent_result.get("assumptions"):
            dcf_assumptions.update(dcf_agent_result["assumptions"])
            if dcf_agent_result.get("agent_output", {}).get("log_message"):
                agent_notes["dcf"] = dcf_agent_result["agent_output"]["log_message"]
        if comps_agent_result.get("peer_overrides"):
            override_peers = [{"ticker": t} for t in comps_agent_result["peer_overrides"]]
            peers = override_peers + (peer_matrix or [])
        if comps_agent_result.get("narrative"):
            agent_notes["comps"] = comps_agent_result["narrative"]

    if peers is None:
        peers = await resolve_peers(symbol)

    current_price = financials.get("current_price")
    dcf = run_dcf(financials, dcf_assumptions, current_price=current_price)
    comps = await run_comps(symbol, financials, peers=peers)
    lbo = run_lbo(financials, default_lbo_assumptions(financials))

    monte_carlo = None
    sensitivity = None
    if include_monte_carlo and not financials.get("insufficient_data"):
        monte_carlo = run_monte_carlo(financials, {"base_assumptions": dcf_assumptions}, current_price)
    if include_sensitivity:
        sensitivity = build_sensitivity_grid(financials, dcf_assumptions, current_price=current_price)

    return {
        "ticker": symbol,
        "financials": financials,
        "dcf": dcf,
        "comps": comps,
        "lbo": lbo,
        "monte_carlo": monte_carlo,
        "sensitivity": sensitivity,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "agent_notes": agent_notes or None,
    }
