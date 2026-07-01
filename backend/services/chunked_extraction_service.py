"""
Map-reduce thesis extraction for long documents (10-K filings).
Splits text into overlapping chunks, extracts per chunk, then merges via Cerebras.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from cerebras.cloud.sdk import Cerebras
from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL

EXTRACTION_PROMPT = """You are a senior investment analyst AI. You have been given raw text from an institutional investment document (10-K filing, analyst memo, research note, or earnings call transcript).

Your job is to extract the core INVESTMENT THESIS ASSUMPTIONS — the specific, measurable claims the document makes about why this asset should perform well.

Return a JSON object with this exact structure:
{
  "ticker_guess": "TSLA",
  "document_type": "Analyst Memo",
  "thesis_points": [
    {
      "id": 1,
      "text": "Operating margins will remain above 18% by FY2025",
      "metric": "Margins",
      "threshold": "18%",
      "timeframe": "FY2025",
      "confidence": "HIGH",
      "page_refs": [3, 4]
    }
  ],
  "key_risks": ["Risk 1", "Risk 2"],
  "target_price": 220.00,
  "rating": "BUY",
  "page_refs": {"summary": [1], "risks": [12]}
}

Rules:
- Extract 3-6 specific, measurable thesis points only
- Each thesis point must have a numeric threshold if possible
- Include page_refs (1-indexed page numbers) where evidence was found
- "metric" must be one of: Margins, Rates, Regulatory, Revenue, Growth, Macro
- Be precise and institutional in language
- If you cannot determine a value, use null"""

PARTIAL_PROMPT = """You are a senior investment analyst AI. Extract PARTIAL thesis data from this document excerpt.
Return JSON only:
{
  "thesis_points": [{"id": 1, "text": "...", "metric": "Margins", "threshold": "18%", "timeframe": "FY2025", "confidence": "HIGH", "page_refs": [3]}],
  "key_risks": ["..."],
  "page_refs": {}
}
Extract 1-3 measurable thesis points from this excerpt only. Use null for fields you cannot determine."""

MERGE_PROMPT = """You are a senior investment analyst AI. Merge partial extractions from a long document into one unified thesis.
Deduplicate thesis points with similar metric+threshold. Cap at 6 thesis points total.
Return JSON with this structure:
{
  "ticker_guess": "TSLA",
  "document_type": "10-K Filing",
  "thesis_points": [...],
  "key_risks": [...],
  "target_price": 220.00,
  "rating": "BUY",
  "page_refs": {}
}
Rules: precise institutional language; each thesis point needs metric from Margins|Rates|Regulatory|Revenue|Growth|Macro."""

CHUNK_SIZE = 4000
CHUNK_OVERLAP = 200
SINGLE_CALL_THRESHOLD = 12_000
MAX_PARALLEL_CHUNKS = 4


def _split_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    if len(text) <= chunk_size:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks


def _call_cerebras_sync(system: str, user: str, max_tokens: int = 1200) -> dict:
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY not set")
    client = Cerebras(api_key=CEREBRAS_API_KEY)
    response = client.chat.completions.create(
        model=CEREBRAS_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        max_tokens=max_tokens,
        temperature=0.2,
    )
    return json.loads(response.choices[0].message.content)


async def _extract_chunk(chunk_text: str, chunk_index: int, total: int) -> dict:
    user = (
        f"Document excerpt {chunk_index + 1} of {total} "
        f"(chars {len(chunk_text)}):\n\n{chunk_text}"
    )
    return await asyncio.to_thread(_call_cerebras_sync, PARTIAL_PROMPT, user, 800)


async def merge_thesis_extractions(partials: list[dict]) -> dict:
    """Merge partial chunk extractions via a final Cerebras call."""
    if not partials:
        return {"thesis_points": [], "key_risks": []}
    if len(partials) == 1:
        return partials[0]
    user = f"Merge these partial extractions:\n\n{json.dumps(partials, indent=2)}"
    return await asyncio.to_thread(_call_cerebras_sync, MERGE_PROMPT, user, 1500)


def _normalize_extraction(result: dict, page_map: dict | None) -> dict:
    if page_map and "page_refs" not in result:
        result["page_refs"] = page_map
    for i, point in enumerate(result.get("thesis_points", [])):
        point.setdefault("id", i + 1)
        point.setdefault("status", "PENDING")
        point.setdefault("current_value", "Awaiting live data")
        if "page_refs" not in point and page_map:
            point.setdefault("page_refs", page_map.get(str(i + 1), []))
    for key in ("target_price", "ticker_guess", "rating", "document_type"):
        if result.get(key) is None:
            result.pop(key, None)
    return result


async def extract_thesis_chunked(text: str, page_map: dict | None = None) -> dict[str, Any]:
    """
    Extract thesis from full document text using map-reduce for long docs.
    Returns extraction dict with extraction_mode and chunks_processed metadata.
    """
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY not set")

    if len(text) <= SINGLE_CALL_THRESHOLD:
        user = f"Extract investment thesis from this document:\n\n{text}"
        result = await asyncio.to_thread(_call_cerebras_sync, EXTRACTION_PROMPT, user, 1200)
        result = _normalize_extraction(result, page_map)
        result["extraction_mode"] = "single"
        result["chunks_processed"] = 1
        return result

    chunks = _split_text(text)
    sem = asyncio.Semaphore(MAX_PARALLEL_CHUNKS)

    async def _bounded(idx: int, chunk: str) -> dict:
        async with sem:
            return await _extract_chunk(chunk, idx, len(chunks))

    partials = await asyncio.gather(*[_bounded(i, c) for i, c in enumerate(chunks)])
    merged = await merge_thesis_extractions(list(partials))
    result = _normalize_extraction(merged, page_map)
    result["extraction_mode"] = "chunked"
    result["chunks_processed"] = len(chunks)
    return result
