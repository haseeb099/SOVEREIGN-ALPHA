"""Embedding, indexing, and semantic retrieval for grounded analysis."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
import numpy as np
from sqlalchemy import delete, select

from database import AsyncSessionLocal
from models import DocumentChunk
from services.chunk_service import chunk_document_text, chunk_market_snapshot

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 1536
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_API_KEY = os.environ.get("EMBEDDING_API_KEY", "")


def _hash_embed(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """Deterministic pseudo-embedding for dev/tests when no API key."""
    seed = int(hashlib.sha256(text.encode()).hexdigest()[:16], 16)
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(dim)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec.astype(float).tolist()


async def embed_text(text: str) -> list[float]:
    """Embed text via OpenAI if configured, else hash-based fallback."""
    if EMBEDDING_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {EMBEDDING_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={"model": EMBEDDING_MODEL, "input": text[:8000]},
                )
                resp.raise_for_status()
                data = resp.json()
                return data["data"][0]["embedding"]
        except Exception as e:
            logger.warning("OpenAI embedding failed, using hash fallback: %s", e)
    return _hash_embed(text)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=float)
    vb = np.array(b, dtype=float)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)


def _parse_embedding(raw: list | str | None) -> list[float] | None:
    if not raw:
        return None
    if isinstance(raw, list):
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _rerank(query: str, candidates: list[dict], top_k: int) -> list[dict]:
    """Lightweight rerank: boost recency and keyword overlap."""
    query_terms = set(query.lower().split())
    now = datetime.now(timezone.utc)

    def score(item: dict) -> float:
        base = item.get("_similarity", 0.0)
        text = item.get("chunk_text", "").lower()
        overlap = sum(1 for t in query_terms if t in text) / max(len(query_terms), 1)
        boost = overlap * 0.15

        meta = item.get("chunk_metadata") or {}
        fetched = meta.get("fetched_at") or meta.get("source_date")
        if fetched:
            try:
                if isinstance(fetched, (int, float)):
                    age_days = (now.timestamp() - float(fetched)) / 86400
                else:
                    dt = datetime.fromisoformat(str(fetched).replace("Z", "+00:00"))
                    age_days = (now - dt).total_seconds() / 86400
                if age_days < 7:
                    boost += 0.1
            except (ValueError, TypeError):
                pass
        return base + boost

    ranked = sorted(candidates, key=score, reverse=True)
    return ranked[:top_k]


async def index_document(
    document_id: str,
    raw_text: str,
    ticker: str | None = None,
    page_refs: dict | None = None,
    source_type: str = "document",
    source_label: str | None = None,
) -> int:
    """Chunk and embed a document; returns number of chunks indexed."""
    extra = {}
    if source_label:
        extra["source_label"] = source_label
    chunks = chunk_document_text(
        raw_text,
        document_id=document_id,
        ticker=ticker,
        source_type=source_type,
        page_refs=page_refs,
        extra_metadata=extra or None,
    )
    if not chunks:
        return 0

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
            )
            for chunk in chunks:
                embedding = await embed_text(chunk["chunk_text"])
                row = DocumentChunk(
                    id=chunk["id"],
                    document_id=document_id,
                    ticker=chunk.get("ticker"),
                    source_type=chunk["source_type"],
                    page=chunk.get("page"),
                    chunk_text=chunk["chunk_text"],
                    embedding=embedding,
                    chunk_metadata=chunk.get("chunk_metadata"),
                )
                session.add(row)
            await session.commit()
        return len(chunks)
    except Exception as e:
        logger.warning("Failed to index document chunks: %s", e)
        return 0


async def index_market_snapshot(ticker: str, market_data: dict) -> bool:
    """Upsert a market snapshot chunk for the ticker."""
    chunk = chunk_market_snapshot(ticker, market_data)
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(DocumentChunk).where(
                    DocumentChunk.ticker == ticker.upper(),
                    DocumentChunk.source_type == "market",
                )
            )
            embedding = await embed_text(chunk["chunk_text"])
            row = DocumentChunk(
                id=chunk["id"],
                document_id=None,
                ticker=chunk["ticker"],
                source_type="market",
                page=None,
                chunk_text=chunk["chunk_text"],
                embedding=embedding,
                chunk_metadata=chunk.get("chunk_metadata"),
            )
            session.add(row)
            await session.commit()
        return True
    except Exception as e:
        logger.warning("Failed to index market snapshot: %s", e)
        return False


async def retrieve(
    ticker: str,
    query: str,
    *,
    filters: dict | None = None,
    top_k: int = 12,
) -> list[dict]:
    """
    Semantic search over indexed chunks with metadata filter and rerank.
    Returns list of chunk dicts with chunk_id, source_type, source_label, etc.
    """
    filters = filters or {}
    source_types = filters.get("source_types")
    document_ids = filters.get("document_ids")

    try:
        query_vec = await embed_text(query)
    except Exception as e:
        logger.warning("Query embedding failed: %s", e)
        return []

    try:
        async with AsyncSessionLocal() as session:
            stmt = select(DocumentChunk).where(DocumentChunk.ticker == ticker.upper())
            if source_types:
                stmt = stmt.where(DocumentChunk.source_type.in_(source_types))
            if document_ids:
                stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
            rows = (await session.execute(stmt)).scalars().all()
    except Exception as e:
        logger.warning("Chunk retrieval query failed: %s", e)
        return []

    candidates: list[dict] = []
    for row in rows:
        emb = _parse_embedding(row.embedding)
        if not emb:
            continue
        sim = _cosine_similarity(query_vec, emb)
        meta = row.chunk_metadata or {}
        source_label = meta.get("source_label")
        if not source_label:
            if row.source_type == "market":
                source_label = "Polygon live quote"
            elif row.page:
                source_label = f"{ticker} document p.{row.page}"
            else:
                source_label = f"{ticker} uploaded document"

        candidates.append(
            {
                "chunk_id": f"market-{row.ticker.upper()}"
                if row.source_type == "market"
                else str(row.id),
                "document_id": str(row.document_id) if row.document_id else None,
                "ticker": row.ticker,
                "source_type": row.source_type,
                "source_label": source_label,
                "source_date": meta.get("source_date")
                or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "page": row.page,
                "chunk_text": row.chunk_text,
                "chunk_metadata": meta,
                "_similarity": sim,
            }
        )

    ranked = _rerank(query, candidates, top_k)
    for item in ranked:
        item.pop("_similarity", None)
    return ranked


async def chunk_id_exists(chunk_id: str) -> bool:
    """Check whether a chunk_id is a known market snapshot or exists in DB."""
    if chunk_id.startswith("market-"):
        return True
    try:
        async with AsyncSessionLocal() as session:
            row = await session.get(DocumentChunk, chunk_id)
            return row is not None
    except Exception:
        return False


def format_retrieved_sources(chunks: list[dict]) -> str:
    """Format retrieved chunks for agent prompts."""
    if not chunks:
        return "RETRIEVED_SOURCES: (none — insufficient verified sources)"
    lines = ["RETRIEVED_SOURCES (cite using chunk_id; do not invent facts):"]
    for c in chunks:
        lines.append(
            f"[chunk_id={c['chunk_id']}] ({c['source_type']}) {c['source_label']} "
            f"({c.get('source_date', 'unknown date')}): {c['chunk_text'][:600]}"
        )
    return "\n".join(lines)
