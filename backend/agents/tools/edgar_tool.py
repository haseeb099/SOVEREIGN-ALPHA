"""SEC EDGAR filing fetch and RAG indexing."""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

import httpx

from services.retrieval_service import embed_text, index_document

logger = logging.getLogger(__name__)

SEC_USER_AGENT = os.environ.get(
    "SEC_EDGAR_USER_AGENT",
    "Sovereign-Alpha contact@example.com",
)
CIK_CACHE_KEY = "sec:cik:{ticker}"
CIK_CACHE_TTL = 86400

_HEADERS = {"User-Agent": SEC_USER_AGENT, "Accept": "application/json"}


async def _get_redis():
    try:
        import redis.asyncio as redis

        url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        return await redis.from_url(url, decode_responses=True)
    except Exception:
        return None


async def _lookup_cik(ticker: str) -> str | None:
    ticker = ticker.upper()
    r = await _get_redis()
    cache_key = CIK_CACHE_KEY.format(ticker=ticker)
    if r:
        try:
            cached = await r.get(cache_key)
            if cached:
                return cached
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=30.0, headers=_HEADERS) as client:
        resp = await client.get(
            "https://www.sec.gov/files/company_tickers.json",
        )
        resp.raise_for_status()
        data = resp.json()

    cik = None
    for entry in data.values():
        if str(entry.get("ticker", "")).upper() == ticker:
            cik = str(entry.get("cik_str", "")).zfill(10)
            break

    if cik and r:
        try:
            await r.setex(cache_key, CIK_CACHE_TTL, cik)
        except Exception:
            pass
    return cik


async def _fetch_filing_text(cik: str, form: str = "10-K") -> tuple[str, str]:
    """Return (accession, plain text) for latest filing of given form."""
    cik_stripped = cik.lstrip("0")
    async with httpx.AsyncClient(timeout=60.0, headers=_HEADERS) as client:
        sub_resp = await client.get(f"https://data.sec.gov/submissions/CIK{cik_stripped}.json")
        sub_resp.raise_for_status()
        submissions = sub_resp.json()

    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [])

    accession = None
    primary = None
    for i, f in enumerate(forms):
        if f == form and i < len(accessions):
            accession = accessions[i].replace("-", "")
            primary = primary_docs[i] if i < len(primary_docs) else None
            break

    if not accession:
        raise ValueError(f"No {form} filing found for CIK {cik}")

    doc_url = (
        f"https://www.sec.gov/Archives/edgar/data/{cik_stripped}/"
        f"{accession}/{primary or 'index.htm'}"
    )
    async with httpx.AsyncClient(timeout=120.0, headers=_HEADERS) as client:
        doc_resp = await client.get(doc_url)
        doc_resp.raise_for_status()
        raw = doc_resp.text

    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text).strip()
    label = f"{form} filing {accession[:12]}"
    return label, text[:500000]


async def fetch_and_index_edgar(ticker: str, form: str = "10-K") -> list[dict]:
    """
    Fetch latest SEC filing for ticker, index as source_type=filing chunks.
    Returns chunk dicts suitable for RAG context.
    """
    cik = await _lookup_cik(ticker)
    if not cik:
        logger.warning("CIK not found for %s", ticker)
        return []

    try:
        label, text = await _fetch_filing_text(cik, form=form)
    except Exception as e:
        logger.warning("EDGAR fetch failed for %s: %s", ticker, e)
        return []

    if not text or len(text) < 200:
        return []

    doc_id = str(uuid.uuid4())
    count = await index_document(
        doc_id,
        text,
        ticker=ticker.upper(),
        source_type="filing",
        source_label=f"SEC {form} — {ticker}",
    )
    if count == 0:
        return []

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    preview = text[:600]
    return [
        {
            "chunk_id": doc_id,
            "source_type": "filing",
            "source_label": f"SEC {form} — {ticker}",
            "source_date": today,
            "chunk_text": preview,
            "document_id": doc_id,
        }
    ]
