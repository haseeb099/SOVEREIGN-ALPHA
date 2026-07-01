"""Optional AI narrative polish for client-ready PDF export."""
from __future__ import annotations

import asyncio
import json

from cerebras.cloud.sdk import Cerebras
from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL

POLISH_PROMPT = """Rewrite memo narrative sections for institutional client export.
Use third-person, precise, professional tone. Return JSON:
{
  "summary": "...",
  "bull_verdict": "...",
  "bear_verdict": "..."
}
Do not change numbers, ratings, or price targets."""


def _polish_sync(memo: dict, template: str) -> dict:
    client = Cerebras(api_key=CEREBRAS_API_KEY)
    user = (
        f"Template: {template}\n"
        f"Summary: {memo.get('summary', '')}\n"
        f"Bull: {memo.get('bull_verdict', '')}\n"
        f"Bear: {memo.get('bear_verdict', '')}"
    )
    response = client.chat.completions.create(
        model=CEREBRAS_MODEL,
        messages=[
            {"role": "system", "content": POLISH_PROMPT},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        max_tokens=800,
        temperature=0.3,
    )
    return json.loads(response.choices[0].message.content)


async def polish_report_narrative(payload: dict, template: str) -> dict:
    """Rewrite narrative sections; returns export_narrative dict."""
    if not CEREBRAS_API_KEY:
        memo = payload.get("memo") or {}
        return {
            "summary": memo.get("summary", ""),
            "bull_verdict": memo.get("bull_verdict", ""),
            "bear_verdict": memo.get("bear_verdict", ""),
        }
    memo = payload.get("memo") or {}
    try:
        return await asyncio.to_thread(_polish_sync, memo, template)
    except Exception:
        return {
            "summary": memo.get("summary", ""),
            "bull_verdict": memo.get("bull_verdict", ""),
            "bear_verdict": memo.get("bear_verdict", ""),
        }
