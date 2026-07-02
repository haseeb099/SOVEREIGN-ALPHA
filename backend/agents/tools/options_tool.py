"""Options flow tool — unusual activity via Polygon or web fallback."""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx

from services.retrieval_service import index_document

logger = logging.getLogger(__name__)


async def _fetch_polygon_options(ticker: str) -> dict | None:
    api_key = os.environ.get("POLYGON_API_KEY", "")
    if not api_key:
        return None
    symbol = ticker.upper()
    url = f"https://api.polygon.io/v3/snapshot/options/{symbol}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, params={"apiKey": api_key})
            if resp.status_code != 200:
                return None
            data = resp.json()
    except Exception as exc:
        logger.warning("Polygon options snapshot failed for %s: %s", symbol, exc)
        return None

    results = data.get("results") or []
    if not results:
        return None

    call_vol = 0
    put_vol = 0
    unusual: list[dict] = []
    for opt in results[:100]:
        details = opt.get("details") or {}
        day = opt.get("day") or {}
        vol = int(day.get("volume") or 0)
        oi = int((opt.get("open_interest") or {}).get("value") or 0)
        opt_type = (details.get("contract_type") or "").lower()
        if opt_type == "call":
            call_vol += vol
        elif opt_type == "put":
            put_vol += vol
        if vol > 0 and (oi == 0 or vol > oi * 2):
            unusual.append(
                {
                    "strike": details.get("strike_price"),
                    "expiration": details.get("expiration_date"),
                    "type": opt_type,
                    "volume": vol,
                    "open_interest": oi,
                }
            )

    return {
        "ticker": symbol,
        "call_volume": call_vol,
        "put_volume": put_vol,
        "put_call_ratio": round(put_vol / call_vol, 2) if call_vol else None,
        "unusual_contracts": unusual[:15],
        "source": "polygon",
    }


async def fetch_and_index_options(ticker: str) -> list[dict]:
    """Detect unusual options activity; index summary for RAG."""
    ticker = ticker.upper()
    snapshot = await _fetch_polygon_options(ticker)
    insufficient = False

    if not snapshot:
        insufficient = True
        snapshot = {
            "ticker": ticker,
            "insufficient_data": True,
            "source": "none",
            "note": "POLYGON_API_KEY not configured or options data unavailable",
        }

    text = f"Options flow snapshot for {ticker}:\n{json.dumps(snapshot, indent=2)}"
    doc_id = str(uuid.uuid4())
    count = await index_document(
        doc_id,
        text,
        ticker=ticker,
        source_type="market",
        source_label=f"Options Flow — {ticker}",
    )
    if count == 0 and not insufficient:
        return []

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    chunk = {
        "chunk_id": doc_id,
        "source_type": "market",
        "source_label": f"Options Flow — {ticker}",
        "source_date": today,
        "chunk_text": text[:600],
        "document_id": doc_id,
        "options_snapshot": snapshot,
        "insufficient_data": insufficient,
    }
    return [chunk]
