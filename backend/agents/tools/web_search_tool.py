"""Web search tool — Tavily API with DuckDuckGo fallback."""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from html import unescape

import httpx

from services.retrieval_service import index_document

logger = logging.getLogger(__name__)

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")


async def _search_tavily(query: str, max_results: int = 5) -> list[dict]:
    api_key = os.environ.get("TAVILY_API_KEY", "") or TAVILY_API_KEY
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": max_results,
                "include_answer": False,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return data.get("results") or []


async def _search_duckduckgo(query: str, max_results: int = 5) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(
            "https://lite.duckduckgo.com/lite/",
            params={"q": query},
            headers={"User-Agent": "Sovereign-Alpha/1.0"},
        )
        resp.raise_for_status()
        html = resp.text

    results = []
    for row in re.finditer(
        r'<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>',
        html,
    ):
        url, title = row.group(1), unescape(row.group(2))
        results.append({"title": title.strip(), "url": url, "content": title})
        if len(results) >= max_results:
            break

    if not results:
        snippets = re.findall(r'<td class="result-snippet"[^>]*>([^<]+)</td>', html)
        for i, snip in enumerate(snippets[:max_results]):
            results.append({"title": f"Result {i+1}", "url": "", "content": unescape(snip)})

    return results


async def search_and_index_web(ticker: str, query: str, max_results: int = 5) -> list[dict]:
    """Search web, index top results as source_type=news chunks."""
    api_key = os.environ.get("TAVILY_API_KEY", "") or TAVILY_API_KEY
    try:
        if api_key:
            hits = await _search_tavily(query, max_results=max_results)
        else:
            hits = await _search_duckduckgo(query, max_results=max_results)
    except Exception as e:
        logger.warning("Web search failed: %s", e)
        return []

    chunks: list[dict] = []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for hit in hits[:max_results]:
        title = hit.get("title") or "Web result"
        content = hit.get("content") or hit.get("snippet") or title
        url = hit.get("url") or ""
        text = f"{title}\n{content}\nSource: {url}".strip()
        if len(text) < 50:
            continue

        doc_id = str(uuid.uuid4())
        count = await index_document(
            doc_id,
            text,
            ticker=ticker.upper(),
            source_type="news",
            source_label=title[:120],
        )
        if count > 0:
            chunks.append(
                {
                    "chunk_id": doc_id,
                    "source_type": "news",
                    "source_label": title[:120],
                    "source_date": today,
                    "chunk_text": text[:600],
                    "document_id": doc_id,
                    "url": url or None,
                }
            )

    return chunks
