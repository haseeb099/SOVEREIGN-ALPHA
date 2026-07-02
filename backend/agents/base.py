"""Shared helpers for Cerebras agent calls and citation validation."""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Callable, Optional

from cerebras.cloud.sdk import Cerebras
from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL

MODEL = CEREBRAS_MODEL
MIN_RETRIEVED_CHUNKS = 2
AGENT_CALL_TIMEOUT_S = 45

logger = logging.getLogger(__name__)

_CITATION_FIELDS = """
  "confidence": 7.5,
  "insufficient_data": false,
  "insufficient_reason": null,
  "citations": [
    {
      "chunk_id": "uuid-from-RETRIEVED_SOURCES",
      "source_type": "document|market|filing|news",
      "source_label": "TSLA 10-K p.42 or Polygon live quote",
      "source_date": "2026-06-30",
      "data_point": "the specific cited fact",
      "url": null
    }
  ],
  "reasoning_steps": ["Step 1: ...", "Step 2: ..."],"""


def derive_rating(price: float, target: float, health: float) -> str:
    """Derive BULLISH/BEARISH/NEUTRAL from upside and thesis health."""
    if not price or price <= 0:
        return "NEUTRAL"
    upside = ((target - price) / price) * 100
    if upside >= 15 and health >= 50:
        return "BULLISH"
    if upside <= -10 or health < 30:
        return "BEARISH"
    return "NEUTRAL"


def call_agent(client: Cerebras, system_prompt: str, user_message: str) -> dict:
    """Synchronous Cerebras call — run in executor for async compat."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        max_tokens=1200,
        temperature=0.3,
        timeout=45,
    )
    raw = response.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("Agent returned non-JSON response: %s", exc)
        return {
            "error": "invalid_json",
            "log_message": "Agent response could not be parsed",
            "confidence": 3.0,
            "insufficient_data": True,
            "insufficient_reason": "Malformed model output",
        }


# Backward-compatible alias for tests patching agents.pipeline._call_agent
_call_agent = call_agent


def default_citation(chunk: dict | None = None) -> dict:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if chunk:
        return {
            "chunk_id": chunk.get("chunk_id"),
            "source_type": chunk.get("source_type", "market"),
            "source_label": chunk.get("source_label", "Live market data"),
            "source_date": chunk.get("source_date", today),
            "data_point": chunk.get("chunk_text", "")[:200],
        }
    return {
        "source_type": "market",
        "source_label": "Live market data",
        "source_date": today,
        "data_point": "Current price and scenario parameters from analysis context",
    }


def validate_citations(
    agent_output: dict,
    valid_chunk_ids: set[str],
    retrieved_chunks: list[dict],
    audit_warnings: list[str],
    agent_name: str,
) -> dict:
    """Validate and repair agent citations against retrieved chunk set."""
    citations = agent_output.get("citations") or []
    if not citations:
        fallback = retrieved_chunks[0] if retrieved_chunks else None
        agent_output["citations"] = [default_citation(fallback)]
        audit_warnings.append(f"{agent_name}: missing citations — injected fallback")
        return agent_output

    repaired = []
    for cite in citations:
        chunk_id = cite.get("chunk_id")
        if chunk_id and chunk_id not in valid_chunk_ids:
            audit_warnings.append(f"{agent_name}: invalid chunk_id {chunk_id} — stripped")
            cite = {k: v for k, v in cite.items() if k != "chunk_id"}
        if not cite.get("source_label"):
            cite["source_label"] = "Unverified source"
        if not cite.get("source_date"):
            cite["source_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if not cite.get("data_point"):
            cite["data_point"] = cite.get("source_label", "Unspecified data point")
        repaired.append(cite)
    agent_output["citations"] = repaired
    return agent_output


_RESEARCH_AGENT_ENUM = {
    "company_research": "COMPANY_RESEARCH",
    "sector_macro_research": "SECTOR_MACRO",
    "competitive_analysis": "COMPETITIVE",
    "esg_compliance": "ESG",
    "insider_sentiment": "INSIDER",
    "options_flow": "OPTIONS_FLOW",
    "verification": "VERIFICATION",
}


def build_agent_trace(
    agent_key: str,
    agent_output: dict,
    elapsed_ms: float | None = None,
) -> dict:
    """Map raw agent JSON to AgentTrace contract."""
    agent_enum = _RESEARCH_AGENT_ENUM.get(agent_key, agent_key.upper())
    if agent_key == "red_team":
        agent_enum = "RED_TEAM"

    confidence = agent_output.get("confidence")
    if confidence is None:
        confidence = agent_output.get("score") or agent_output.get("macro_score") or 5.0

    trace = {
        "agent": agent_enum,
        "confidence": float(confidence),
        "insufficient_data": bool(agent_output.get("insufficient_data", False)),
        "citations": agent_output.get("citations") or [default_citation()],
        "log_message": agent_output.get("log_message", f"{agent_enum} complete"),
    }
    reason = agent_output.get("insufficient_reason")
    if reason:
        trace["insufficient_reason"] = reason
    steps = agent_output.get("reasoning_steps")
    if steps:
        trace["reasoning_steps"] = steps
    if elapsed_ms is not None:
        trace["elapsed_ms"] = elapsed_ms
    return trace


def apply_insufficient_data_rule(
    agent_output: dict,
    retrieved_count: int,
    has_market: bool,
) -> dict:
    if retrieved_count < MIN_RETRIEVED_CHUNKS and not has_market:
        agent_output["insufficient_data"] = True
        agent_output["insufficient_reason"] = (
            f"Only {retrieved_count} retrieved source(s) and no live market data"
        )
        conf = float(agent_output.get("confidence") or agent_output.get("confidence_score") or 5)
        agent_output["confidence"] = min(conf, 4.0)
    return agent_output


def build_analysis_context(
    ticker: str,
    market_data: dict,
    scenario: dict,
    retrieved_sources: str,
    thesis_points: Optional[list] = None,
    prior_analyses: Optional[str] = None,
    research_brief: Optional[str] = None,
    red_team_signals: Optional[dict] = None,
) -> str:
    """Build shared user-message context for analysis agents."""
    context = f"""
Asset: {ticker}
Full Name: {market_data.get('full_name', ticker)}
Current Price: ${market_data.get('price', 0):,.2f}
24h Change: {market_data.get('change_pct', 0):+.1f}%
30-Day Volatility: {market_data.get('volatility_30d', 0):.1f}%

Scenario Parameters:
- Operating Margins: {scenario.get('margins', 18.5)}%
- Interest Rates: {scenario.get('rates', 4.5)}%
- Regulatory Pressure: {scenario.get('regulatory', 'Low')}
- Market Sentiment: {scenario.get('sentiment', 'Neutral')}

{retrieved_sources}
"""
    if research_brief:
        context += f"\n{research_brief}\n"
    if red_team_signals:
        context += f"\nRED_TEAM_SIGNALS:\n{json.dumps(red_team_signals, indent=2)}\n"
    if prior_analyses:
        context += f"\n{prior_analyses}\n"
    if thesis_points:
        context += f"\nExisting Thesis Points to Evaluate:\n{json.dumps(thesis_points, indent=2)}"
    return context


async def agent_log(
    on_log: Optional[Callable],
    agent: str,
    message: str,
    start_time: float,
    workflow_id: Optional[str] = None,
):
    if on_log:
        event = {
            "agent": agent,
            "message": message,
            "ts": round(time.time() - start_time, 2),
        }
        if workflow_id:
            event["workflow_id"] = workflow_id
        await on_log(event)


def require_cerebras_client() -> Cerebras:
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY not set in environment")
    return Cerebras(api_key=CEREBRAS_API_KEY)


# Private aliases used by agent modules and legacy pipeline
_apply_insufficient_data_rule = apply_insufficient_data_rule
_default_citation = default_citation
