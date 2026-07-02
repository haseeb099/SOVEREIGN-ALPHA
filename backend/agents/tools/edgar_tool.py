"""SEC EDGAR filing fetch and RAG indexing."""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

import httpx

from services.retrieval_service import index_document

logger = logging.getLogger(__name__)

SEC_USER_AGENT = os.environ.get(
    "SEC_EDGAR_USER_AGENT",
    "Sovereign-Alpha contact@example.com",
)
CIK_CACHE_KEY = "sec:cik:{ticker}"
CIK_CACHE_TTL = 86400
LAST_FILING_KEY = "edgar:last:{ticker}:{form}"

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


async def _fetch_submissions(cik: str) -> dict:
    cik_padded = cik.zfill(10)
    async with httpx.AsyncClient(timeout=60.0, headers=_HEADERS) as client:
        sub_resp = await client.get(f"https://data.sec.gov/submissions/CIK{cik_padded}.json")
        sub_resp.raise_for_status()
        return sub_resp.json()


async def list_recent_filings(
    cik: str,
    forms: list[str] | None = None,
    limit: int = 20,
) -> list[dict]:
    """List recent filings for a CIK filtered by form types."""
    forms = forms or ["10-K", "10-Q", "8-K", "4"]
    form_set = set(forms)
    submissions = await _fetch_submissions(cik)
    recent = submissions.get("filings", {}).get("recent", {})
    form_list = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [])
    filing_dates = recent.get("filingDate", [])

    results: list[dict] = []
    for i, form in enumerate(form_list):
        if form not in form_set:
            continue
        if i >= len(accessions):
            continue
        accession = accessions[i]
        results.append(
            {
                "form": form,
                "accession": accession,
                "accession_compact": accession.replace("-", ""),
                "primary_document": primary_docs[i] if i < len(primary_docs) else None,
                "filed_at": filing_dates[i] if i < len(filing_dates) else None,
            }
        )
        if len(results) >= limit:
            break
    return results


async def fetch_filing_by_accession(
    cik: str,
    accession: str,
    primary_doc: str | None = None,
    form: str = "10-K",
) -> tuple[str, str]:
    """Return (label, plain text) for a specific filing accession."""
    cik_stripped = cik.lstrip("0")
    accession_compact = accession.replace("-", "")
    doc_url = (
        f"https://www.sec.gov/Archives/edgar/data/{cik_stripped}/"
        f"{accession_compact}/{primary_doc or 'index.htm'}"
    )
    async with httpx.AsyncClient(timeout=120.0, headers=_HEADERS) as client:
        doc_resp = await client.get(doc_url)
        doc_resp.raise_for_status()
        raw = doc_resp.text

    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text).strip()
    label = f"{form} filing {accession_compact[:12]}"
    return label, text[:500000]


async def _fetch_filing_text(cik: str, form: str = "10-K") -> tuple[str, str]:
    """Return (accession, plain text) for latest filing of given form."""
    filings = await list_recent_filings(cik, forms=[form], limit=1)
    if not filings:
        raise ValueError(f"No {form} filing found for CIK {cik}")
    f = filings[0]
    return await fetch_filing_by_accession(
        cik,
        f["accession"],
        f.get("primary_document"),
        form=form,
    )


def _parse_form4_transactions(text: str) -> list[dict]:
    """Best-effort parse of Form 4 plain text for insider transactions."""
    transactions: list[dict] = []
    patterns = [
        re.compile(
            r"(?P<name>[A-Z][A-Za-z .'-]{2,40})\s+"
            r"(?P<action>bought|sold|purchased|acquired|disposed)\s+"
            r"(?P<shares>[\d,]+)\s+shares?\s+"
            r"(?:at\s+\$?(?P<price>[\d.]+))?",
            re.I,
        ),
        re.compile(
            r"Reporting Owner[:\s]+(?P<name>[A-Z][A-Za-z .'-]{2,40}).*?"
            r"Transaction (?:Code|Type)[:\s]+(?P<code>[SP]).*?"
            r"Shares[:\s]+(?P<shares>[\d,]+)",
            re.I | re.S,
        ),
    ]
    for pat in patterns:
        for m in pat.finditer(text[:50000]):
            groups = m.groupdict()
            action = (groups.get("action") or groups.get("code") or "").lower()
            if action in ("s", "sold", "disposed"):
                side = "sell"
            elif action in ("p", "bought", "purchased", "acquired"):
                side = "buy"
            else:
                side = "unknown"
            shares_raw = (groups.get("shares") or "0").replace(",", "")
            try:
                shares = float(shares_raw)
            except ValueError:
                shares = 0
            transactions.append(
                {
                    "insider_name": groups.get("name", "Unknown").strip(),
                    "side": side,
                    "shares": shares,
                    "price": groups.get("price"),
                }
            )
    return transactions[:25]


async def fetch_form4_insider_activity(ticker: str, limit: int = 25) -> list[dict]:
    """Fetch recent Form 4 insider transactions for a ticker."""
    cik = await _lookup_cik(ticker)
    if not cik:
        return []

    filings = await list_recent_filings(cik, forms=["4"], limit=limit)
    activities: list[dict] = []
    for f in filings:
        try:
            _, text = await fetch_filing_by_accession(
                cik,
                f["accession"],
                f.get("primary_document"),
                form="4",
            )
        except Exception as exc:
            logger.debug("Form 4 fetch failed %s: %s", f.get("accession"), exc)
            continue
        for tx in _parse_form4_transactions(text):
            activities.append(
                {
                    "ticker": ticker.upper(),
                    "form": "4",
                    "accession": f["accession"],
                    "filed_at": f.get("filed_at"),
                    **tx,
                }
            )
        if len(activities) >= limit:
            break
    return activities[:limit]


async def detect_new_filings(ticker: str, since_accession: str | None = None) -> list[dict]:
    """
    Compare latest SEC filings against Redis watermark.
    Returns new filings not yet seen for each form type.
    """
    ticker = ticker.upper()
    cik = await _lookup_cik(ticker)
    if not cik:
        return []

    watch_forms = os.environ.get("WATCHER_FORMS", "10-Q,8-K,10-K,4").split(",")
    watch_forms = [f.strip() for f in watch_forms if f.strip()]
    recent = await list_recent_filings(cik, forms=watch_forms, limit=10)
    if not recent:
        return []

    r = await _get_redis()
    new_filings: list[dict] = []
    for f in recent:
        form = f["form"]
        accession = f["accession"]
        redis_key = LAST_FILING_KEY.format(ticker=ticker, form=form)
        last_seen = since_accession
        if r and not since_accession:
            try:
                last_seen = await r.get(redis_key)
            except Exception:
                last_seen = None
        if last_seen and accession == last_seen:
            continue
        if since_accession and accession == since_accession:
            continue
        new_filings.append({**f, "ticker": ticker, "cik": cik})
    return new_filings


async def mark_filing_seen(ticker: str, form: str, accession: str) -> None:
    """Update Redis watermark after ingesting a filing."""
    r = await _get_redis()
    if not r:
        return
    try:
        key = LAST_FILING_KEY.format(ticker=ticker.upper(), form=form)
        await r.set(key, accession)
    except Exception:
        pass


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

    filings = await list_recent_filings(cik, forms=[form], limit=1)
    if filings:
        await mark_filing_seen(ticker, form, filings[0]["accession"])

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
