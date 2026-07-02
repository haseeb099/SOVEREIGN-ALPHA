"""Insider activity tool — normalize Form 4 data and index for RAG."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from agents.tools.edgar_tool import fetch_form4_insider_activity
from services.retrieval_service import index_document

logger = logging.getLogger(__name__)


async def fetch_and_index_insider(ticker: str, limit: int = 25) -> list[dict]:
    """Fetch Form 4 insider transactions, index summary, return chunk dicts."""
    ticker = ticker.upper()
    activities = await fetch_form4_insider_activity(ticker, limit=limit)
    if not activities:
        return []

    summary_lines = []
    for a in activities:
        price = f" @ ${a['price']}" if a.get("price") else ""
        summary_lines.append(
            f"{a.get('filed_at', 'N/A')}: {a.get('insider_name')} "
            f"{a.get('side')} {a.get('shares')} shares{price}"
        )
    text = f"Insider Form 4 activity for {ticker}:\n" + "\n".join(summary_lines)
    text += f"\n\nRaw JSON:\n{json.dumps(activities, indent=2)}"

    doc_id = str(uuid.uuid4())
    count = await index_document(
        doc_id,
        text,
        ticker=ticker,
        source_type="filing",
        source_label=f"SEC Form 4 Insider — {ticker}",
    )
    if count == 0:
        return []

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return [
        {
            "chunk_id": doc_id,
            "source_type": "filing",
            "source_label": f"SEC Form 4 Insider — {ticker}",
            "source_date": today,
            "chunk_text": text[:600],
            "document_id": doc_id,
            "insider_activities": activities,
        }
    ]
