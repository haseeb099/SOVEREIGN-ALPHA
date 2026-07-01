"""Cross-agent consistency checks for grounded analysis output."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _price_spread_pct(a: float, b: float) -> float:
    if not a or not b:
        return 0.0
    mid = (abs(a) + abs(b)) / 2
    if mid == 0:
        return 0.0
    return abs(a - b) / mid * 100


def _parse_date(date_str: str | None) -> datetime | None:
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def run_consistency_checks(
    result: dict,
    *,
    retrieved_chunks: list[dict] | None = None,
) -> list[str]:
    """
    Post-pipeline cross-agent checks. Returns warnings to append to memo.audit_warnings.
    """
    warnings: list[str] = []
    memo = result.get("memo") or {}
    raw = result.get("raw_agents") or {}
    bull = raw.get("bull") or {}
    red_team = raw.get("red_team") or {}
    synthesis = raw.get("synthesis") or {}
    spot = float(result.get("asset_price") or 0)
    synth_target = float(memo.get("price_target") or synthesis.get("price_target") or 0)
    bull_target = float(bull.get("price_target") or 0)
    bear_target = float(red_team.get("bear_price_target") or 0)

    if bull_target and bear_target and _price_spread_pct(bull_target, bear_target) > 30:
        warnings.append(
            f"Bull target (${bull_target:,.0f}) vs bear target (${bear_target:,.0f}) diverge >30%"
        )

    if bull_target and synth_target and _price_spread_pct(bull_target, synth_target) > 30:
        warnings.append(
            f"Synthesis target (${synth_target:,.0f}) diverges >30% from bull target (${bull_target:,.0f})"
        )

    rating = memo.get("rating", "NEUTRAL")
    if spot > 0 and synth_target:
        upside = ((synth_target - spot) / spot) * 100
        if rating == "BULLISH" and upside < 15:
            warnings.append(f"Rating BULLISH but upside only {upside:.1f}% vs spot")
        if rating == "BEARISH" and upside > 10:
            warnings.append(f"Rating BEARISH but implied upside is {upside:.1f}%")

    fundamental = raw.get("fundamental") or {}
    fund_score = float(fundamental.get("score") or fundamental.get("confidence") or 5)
    bull_verdict = (bull.get("verdict") or "").lower()
    if fund_score <= 3 and any(w in bull_verdict for w in ("strong", "robust", "compelling")):
        warnings.append("Fundamental score ≤3 but bull verdict language is strongly bullish")

    thesis_points = result.get("thesis_points") or []
    traces = result.get("agent_traces") or []
    synthesis_citations = synthesis.get("citations") or []
    all_citation_ids = set()
    for trace in traces:
        for cite in trace.get("citations") or []:
            if cite.get("chunk_id"):
                all_citation_ids.add(cite["chunk_id"])

    for tp in thesis_points:
        tp_text = tp.get("text", "")
        if tp_text and not synthesis_citations and not all_citation_ids:
            warnings.append(f"Thesis point lacks supporting citation: {tp_text[:80]}")

    now = datetime.now(timezone.utc)
    for trace in traces:
        for cite in trace.get("citations") or []:
            cite_date = _parse_date(cite.get("source_date"))
            if cite_date:
                if cite_date.tzinfo is None:
                    cite_date = cite_date.replace(tzinfo=timezone.utc)
                if (now - cite_date).days > 90:
                    if cite.get("source_type") in ("market", "news"):
                        warnings.append(
                            f"Stale citation ({cite.get('source_date')}) for market-sensitive claim"
                        )

    if retrieved_chunks is not None and len(retrieved_chunks) < 2 and spot <= 0:
        warnings.append("Insufficient retrieved sources and no live market price for grounding")

    return warnings
