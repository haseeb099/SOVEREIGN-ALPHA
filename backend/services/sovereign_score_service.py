"""Sovereign Score™ — proprietary composite signal."""
from typing import Any, Optional

# Documented methodology weights (Phase 9.1)
METHODOLOGY_WEIGHTS = {
    "thesis_health": 0.35,
    "risk_index_inverted": 0.20,
    "agent_consensus_spread": 0.15,
    "sentiment_momentum": 0.15,
    "macro_alignment": 0.15,
}


def compute_sovereign_score(
    memo: dict,
    thesis_points: list,
    market_data: Optional[dict] = None,
) -> dict[str, Any]:
    """
    Score (0-100) = weighted blend per METHODOLOGY_WEIGHTS.
    Always returns score plus component breakdown for transparency.
    """
    if thesis_points:
        pass_count = sum(1 for tp in thesis_points if tp.get("status") == "PASS")
        thesis_health = (pass_count / len(thesis_points)) * 100
    else:
        thesis_health = memo.get("confidence_score", 5) * 10

    warnings = memo.get("audit_warnings") or []
    risk_index = min(100, len(warnings) * 15 + 20)
    risk_inverted = 100 - risk_index

    dist = memo.get("distribution") or {}
    if dist:
        bear = dist.get("bear", {}).get("price", 0)
        bull = dist.get("bull", {}).get("price", 0)
        base = dist.get("base", {}).get("price", 1) or 1
        spread = abs(bull - bear) / base * 100
        consensus = max(0, 100 - spread)
    else:
        consensus = 70.0

    if market_data:
        change = market_data.get("change_pct", 0)
        sentiment = 50 + min(50, max(-50, change * 5))
    else:
        sentiment = 50.0

    macro_alignment = min(100, memo.get("confidence_score", 5) * 10)

    components = {
        "thesis_health": round(thesis_health, 1),
        "risk_index_inverted": round(risk_inverted, 1),
        "agent_consensus_spread": round(consensus, 1),
        "sentiment_momentum": round(sentiment, 1),
        "macro_alignment": round(macro_alignment, 1),
    }

    score = sum(components[k] * METHODOLOGY_WEIGHTS[k] for k in METHODOLOGY_WEIGHTS)
    score = round(max(0, min(100, score)), 1)

    return {
        "score": score,
        "methodology": METHODOLOGY_WEIGHTS,
        "components": components,
    }


def attach_sovereign_score(result: dict[str, Any], market_data: Optional[dict] = None) -> dict[str, Any]:
    """Add sovereign_score (0-100) and methodology detail — always computed on analyze."""
    memo = result.get("memo") or {}
    sovereign = compute_sovereign_score(memo, result.get("thesis_points") or [], market_data)
    result["sovereign_score"] = sovereign["score"]
    result["sovereign_score_detail"] = {
        "methodology": sovereign["methodology"],
        "components": sovereign["components"],
    }
    return result
