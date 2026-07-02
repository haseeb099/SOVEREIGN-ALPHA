"""ESG / compliance tool — OpenSanctions screen + governance heuristics."""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx

from agents.tools.edgar_tool import fetch_and_index_edgar
from services.retrieval_service import index_document

logger = logging.getLogger(__name__)

OPENSANCTIONS_API_URL = os.environ.get(
    "OPENSANCTIONS_API_URL",
    "https://api.opensanctions.org",
)


async def _screen_opensanctions(name: str) -> dict:
    """Query OpenSanctions match API for entity name."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"{OPENSANCTIONS_API_URL}/match/default",
                params={"q": name, "limit": 5},
            )
            if resp.status_code != 200:
                return {"hits": [], "error": f"HTTP {resp.status_code}"}
            data = resp.json()
    except Exception as exc:
        logger.warning("OpenSanctions query failed: %s", exc)
        return {"hits": [], "error": str(exc)}

    results = data.get("results") or data.get("responses", {}).get("default", {}).get("results") or []
    hits = []
    for r in results[:5]:
        entity = r.get("entity") or r
        hits.append(
            {
                "name": entity.get("caption") or entity.get("name"),
                "schema": entity.get("schema"),
                "score": r.get("score"),
                "datasets": entity.get("datasets") or [],
            }
        )
    return {"hits": hits, "query": name}


async def fetch_and_index_esg(ticker: str, company_name: str | None = None) -> list[dict]:
    """Run sanctions screen and pull governance excerpts from filings."""
    ticker = ticker.upper()
    query_name = company_name or ticker
    sanctions = await _screen_opensanctions(query_name)

    gov_chunks = await fetch_and_index_edgar(ticker, form="DEF 14A")
    if not gov_chunks:
        gov_chunks = await fetch_and_index_edgar(ticker, form="10-K")

    payload = {
        "ticker": ticker,
        "sanctions_screen": sanctions,
        "sanctions_hit": len(sanctions.get("hits") or []) > 0,
        "governance_filing_chunks": len(gov_chunks),
    }
    text = f"ESG/Compliance screen for {ticker}:\n{json.dumps(payload, indent=2)}"

    doc_id = str(uuid.uuid4())
    count = await index_document(
        doc_id,
        text,
        ticker=ticker,
        source_type="filing",
        source_label=f"ESG Compliance — {ticker}",
    )

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    chunks = list(gov_chunks)
    if count > 0:
        chunks.append(
            {
                "chunk_id": doc_id,
                "source_type": "filing",
                "source_label": f"ESG Compliance — {ticker}",
                "source_date": today,
                "chunk_text": text[:600],
                "document_id": doc_id,
                "esg_payload": payload,
            }
        )
    elif not chunks:
        chunks.append(
            {
                "chunk_id": doc_id,
                "source_type": "filing",
                "source_label": f"ESG Compliance — {ticker}",
                "source_date": today,
                "chunk_text": text[:600],
                "document_id": doc_id,
                "esg_payload": payload,
                "insufficient_data": True,
            }
        )
    return chunks
