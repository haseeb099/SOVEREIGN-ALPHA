"""Peer resolver — identify 3–5 comparable tickers for competitive analysis."""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx

from services.retrieval_service import index_document

logger = logging.getLogger(__name__)

POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")
SECTOR_KEYWORDS = {
    "auto": ["F", "GM", "RIVN", "LCID", "NIO"],
    "tech": ["AAPL", "MSFT", "GOOGL", "META", "AMZN"],
    "semi": ["AMD", "INTC", "AVGO", "QCOM", "MU"],
    "ev": ["RIVN", "LCID", "NIO", "F", "GM"],
}


async def _polygon_ticker_details(ticker: str) -> dict | None:
    if not POLYGON_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"https://api.polygon.io/v3/reference/tickers/{ticker.upper()}",
                params={"apiKey": POLYGON_API_KEY},
            )
            if resp.status_code != 200:
                return None
            return resp.json().get("results") or {}
    except Exception as exc:
        logger.debug("Polygon ticker details failed: %s", exc)
        return None


def _keyword_peers(ticker: str, sector_hint: str | None = None) -> list[str]:
    hint = (sector_hint or "").lower()
    for key, peers in SECTOR_KEYWORDS.items():
        if key in hint or ticker.upper() in peers:
            return [p for p in peers if p != ticker.upper()][:5]
    return ["SPY", "QQQ", "IWM"][:3]


async def resolve_peers(ticker: str, sector_hint: str | None = None) -> list[dict]:
    """Resolve 3–5 peer tickers with basic metadata."""
    ticker = ticker.upper()
    details = await _polygon_ticker_details(ticker)
    sector = None
    if details:
        sector = details.get("sic_description") or details.get("market")

    peer_tickers = _keyword_peers(ticker, sector or sector_hint)
    peers: list[dict] = []
    for pt in peer_tickers:
        pd = await _polygon_ticker_details(pt)
        peers.append(
            {
                "ticker": pt,
                "name": (pd or {}).get("name", pt),
                "sector": (pd or {}).get("sic_description"),
            }
        )
    return peers[:5]


async def fetch_and_index_peers(ticker: str, sector_hint: str | None = None) -> list[dict]:
    """Resolve peers and index peer set for RAG."""
    ticker = ticker.upper()
    peers = await resolve_peers(ticker, sector_hint)
    payload = {"subject": ticker, "peers": peers}
    text = f"Peer set for {ticker}:\n{json.dumps(payload, indent=2)}"

    doc_id = str(uuid.uuid4())
    count = await index_document(
        doc_id,
        text,
        ticker=ticker,
        source_type="market",
        source_label=f"Peer Comparison — {ticker}",
    )
    if count == 0:
        return []

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return [
        {
            "chunk_id": doc_id,
            "source_type": "market",
            "source_label": f"Peer Comparison — {ticker}",
            "source_date": today,
            "chunk_text": text[:600],
            "document_id": doc_id,
            "peers": peers,
        }
    ]
