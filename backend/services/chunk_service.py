"""Split documents into overlapping chunks with page references."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

# Approximate tokens as ~4 chars; target 500-800 tokens with overlap
MIN_CHUNK_CHARS = 500 * 4
MAX_CHUNK_CHARS = 800 * 4
OVERLAP_CHARS = 100 * 4

PAGE_MARKER = re.compile(r"^---\s*(?:Page|Paragraph)\s+(\d+)\s*---\s*$", re.MULTILINE)


def _detect_page(text: str, offset: int, page_map: dict | None) -> int | None:
    """Best-effort page number from inline markers or page_map."""
    before = text[:offset]
    matches = list(PAGE_MARKER.finditer(before))
    if matches:
        return int(matches[-1].group(1))
    if page_map:
        for key, refs in page_map.items():
            if key.isdigit() and refs:
                return refs[0] if isinstance(refs, list) else refs
    return None


def chunk_document_text(
    text: str,
    *,
    document_id: str | None = None,
    ticker: str | None = None,
    source_type: str = "document",
    page_refs: dict | None = None,
    extra_metadata: dict | None = None,
) -> list[dict[str, Any]]:
    """
    Split text into 500-800 token chunks (~2000-3200 chars) with overlap.
    Returns chunk dicts ready for embedding/indexing.
    """
    text = text.strip()
    if not text:
        return []

    chunks: list[dict[str, Any]] = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + MAX_CHUNK_CHARS, length)
        if end < length:
            # Prefer breaking at paragraph or sentence boundary
            break_at = text.rfind("\n\n", start + MIN_CHUNK_CHARS, end)
            if break_at == -1:
                break_at = text.rfind(". ", start + MIN_CHUNK_CHARS, end)
            if break_at != -1:
                end = break_at + 1

        chunk_text = text[start:end].strip()
        if chunk_text:
            page = _detect_page(text, start, page_refs)
            meta = dict(extra_metadata or {})
            if page_refs:
                meta["page_refs"] = page_refs
            chunks.append(
                {
                    "id": str(uuid.uuid4()),
                    "document_id": document_id,
                    "ticker": ticker.upper() if ticker else None,
                    "source_type": source_type,
                    "page": page,
                    "chunk_text": chunk_text,
                    "chunk_metadata": meta,
                }
            )

        if end >= length:
            break
        start = max(end - OVERLAP_CHARS, start + 1)

    return chunks


def chunk_market_snapshot(ticker: str, market_data: dict) -> dict[str, Any]:
    """Build a single structured market snapshot chunk for indexing."""
    price = market_data.get("price", 0)
    change = market_data.get("change_pct", 0)
    vol = market_data.get("volatility_30d", 0)
    name = market_data.get("full_name", ticker)
    source = market_data.get("source", "market")
    fetched = market_data.get("fetched_at")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    text = (
        f"{name} ({ticker}) live market snapshot: "
        f"price ${price:,.2f}, 24h change {change:+.1f}%, "
        f"30-day volatility {vol:.1f}%. Source: {source}."
    )
    return {
        "id": f"market-{ticker.upper()}",
        "document_id": None,
        "ticker": ticker.upper(),
        "source_type": "market",
        "page": None,
        "chunk_text": text,
        "chunk_metadata": {
            "price": price,
            "change_pct": change,
            "volatility_30d": vol,
            "source": source,
            "fetched_at": fetched,
            "source_date": today,
            "source_label": "Polygon live quote",
        },
    }
