"""DCF assumptions agent — structured output from financials + research."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from agents.base import _call_agent, default_citation
from cerebras_config import CEREBRAS_API_KEY
from cerebras.cloud.sdk import Cerebras

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the DCF Assumptions Agent on Sovereign-Alpha.
Given financial snapshot and optional research context, output structured DCF assumptions.
Output ONLY valid JSON:
{
  "agent": "DCF",
  "projection_years": 5,
  "wacc": 0.10,
  "terminal_growth": 0.025,
  "fcf_margin": 0.12,
  "revenue_growth": 0.08,
  "capex_pct": 0.05,
  "nwc_pct": 0.02,
  "confidence": 7.0,
  "agent_narrative": "Brief rationale for assumptions",
  "citations": [],
  "log_message": "One-line summary"
}"""


def _default_client() -> Cerebras | None:
    if not CEREBRAS_API_KEY:
        return None
    return Cerebras(api_key=CEREBRAS_API_KEY)


async def generate_dcf_assumptions(
    ticker: str,
    financials: dict[str, Any],
    research_context: str = "",
    client: Cerebras | None = None,
) -> dict[str, Any]:
    """Run DCF agent or return empty dict on failure."""
    cerebras = client or _default_client()
    if cerebras is None:
        return {}

    user_msg = (
        f"Ticker: {ticker}\n"
        f"Financials: {json.dumps(financials, default=str)}\n"
        f"Research: {research_context[:3000]}"
    )
    loop = asyncio.get_event_loop()
    try:
        output = await loop.run_in_executor(None, _call_agent, cerebras, SYSTEM_PROMPT, user_msg)
        assumptions = {
            "projection_years": int(output.get("projection_years") or 5),
            "wacc": float(output.get("wacc") or 0.10),
            "terminal_growth": float(output.get("terminal_growth") or 0.025),
            "fcf_margin": float(output.get("fcf_margin") or 0.12),
            "revenue_growth": float(output.get("revenue_growth") or 0.08),
            "capex_pct": float(output.get("capex_pct") or 0.05),
            "nwc_pct": float(output.get("nwc_pct") or 0.02),
            "agent_confidence": output.get("confidence"),
            "agent_narrative": output.get("agent_narrative") or output.get("log_message"),
        }
        if not output.get("citations"):
            output["citations"] = [default_citation()]
        return {"assumptions": assumptions, "agent_output": output}
    except Exception as exc:
        logger.warning("DCF agent failed for %s: %s", ticker, exc)
        return {}
