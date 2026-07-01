"""Agent memory — prior thesis evolution for planning and analysis context."""
from __future__ import annotations

from services.persistence_service import get_analysis_history


async def load_thesis_evolution(
    ticker: str,
    user_id: str | None = None,
    limit: int = 3,
) -> str:
    """
    Load recent analysis history and format as PRIOR_ANALYSES block for agent prompts.
    """
    history = await get_analysis_history(ticker, limit=limit)
    if user_id:
        history = [h for h in history if h.get("user_id") == user_id] or history

    if not history:
        return ""

    lines = ["PRIOR_ANALYSES (thesis evolution — use for continuity, not as sole evidence):"]
    prev_rating = None
    prev_target = None

    for i, entry in enumerate(reversed(history[-limit:]), 1):
        memo = entry.get("memo") or {}
        rating = memo.get("rating", "N/A")
        target = memo.get("price_target")
        created = entry.get("created_at", "")[:10]
        summary = (memo.get("summary") or "")[:160]

        delta_parts = []
        if prev_rating and rating != prev_rating:
            delta_parts.append(f"rating {prev_rating}→{rating}")
        if prev_target and target and prev_target != target:
            delta_parts.append(f"target ${prev_target:,.0f}→${target:,.0f}")
        delta = f" ({', '.join(delta_parts)})" if delta_parts else ""

        lines.append(
            f"{i}. [{created}] {ticker} — {rating}, target ${target or 0:,.0f}{delta}: {summary}"
        )
        prev_rating = rating
        prev_target = target

    return "\n".join(lines)
