"""Comps valuation agent — peer selection and assumption overrides."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from agents.base import _call_agent, default_citation
from cerebras_config import CEREBRAS_API_KEY
from cerebras.cloud.sdk import Cerebras

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the Comps Valuation Agent on Sovereign-Alpha.
Validate peer selection and suggest assumption overrides for comparable multiples analysis.
Output ONLY valid JSON:
{
  "agent": "COMPS_VALUATION",
  "peer_overrides": ["AAPL", "MSFT"],
  "exclude_peers": [],
  "multiple_adjustment_pct": 0,
  "confidence": 7.0,
  "narrative": "Brief comps rationale",
  "citations": [],
  "log_message": "One-line summary"
}"""


def _default_client() -> Cerebras | None:
    if not CEREBRAS_API_KEY:
        return None
    return Cerebras(api_key=CEREBRAS_API_KEY)


async def generate_comps_overrides(
    ticker: str,
    financials: dict[str, Any],
    peer_matrix: list[dict] | None = None,
    research_context: str = "",
    client: Cerebras | None = None,
) -> dict[str, Any]:
    """Run comps valuation agent or return empty dict on failure."""
    cerebras = client or _default_client()
    if cerebras is None:
        return {}

    user_msg = (
        f"Ticker: {ticker}\n"
        f"Financials: {json.dumps(financials, default=str)}\n"
        f"Peer matrix: {json.dumps(peer_matrix or [], default=str)}\n"
        f"Research: {research_context[:3000]}"
    )
    loop = asyncio.get_event_loop()
    try:
        output = await loop.run_in_executor(None, _call_agent, cerebras, SYSTEM_PROMPT, user_msg)
        if not output.get("citations"):
            output["citations"] = [default_citation()]
        return {
            "peer_overrides": output.get("peer_overrides") or [],
            "exclude_peers": output.get("exclude_peers") or [],
            "multiple_adjustment_pct": float(output.get("multiple_adjustment_pct") or 0),
            "narrative": output.get("narrative") or output.get("log_message"),
            "agent_output": output,
        }
    except Exception as exc:
        logger.warning("Comps agent failed for %s: %s", ticker, exc)
        return {}
