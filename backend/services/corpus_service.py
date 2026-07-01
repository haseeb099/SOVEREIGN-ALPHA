"""Multi-document corpus management and cross-doc thesis synthesis."""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Optional

from sqlalchemy import select

from cerebras.cloud.sdk import Cerebras
from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL
from database import AsyncSessionLocal
from models import DocumentCorpus, IngestedDocument
from services.retrieval_service import retrieve

SYNTHESIS_PROMPT = """You are a senior investment analyst. Synthesize thesis data from multiple research documents into one unified view.
Return JSON:
{
  "ticker_guess": "TSLA",
  "thesis_points": [{"id": 1, "text": "...", "metric": "Margins", "threshold": "18%", "status": "PENDING", "current_value": "Awaiting live data"}],
  "key_risks": ["..."],
  "target_price": 220.0,
  "rating": "BUY",
  "source_documents": [{"document_id": "uuid", "filename": "memo.pdf", "role": "primary"}]
}
Deduplicate overlapping points. Cap at 6 thesis points."""


def _call_cerebras_sync(system: str, user: str) -> dict:
    client = Cerebras(api_key=CEREBRAS_API_KEY)
    response = client.chat.completions.create(
        model=CEREBRAS_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        max_tokens=1500,
        temperature=0.2,
    )
    return json.loads(response.choices[0].message.content)


async def create_corpus(
    user_id: str,
    ticker: str | None,
    name: str,
    document_ids: list[str],
) -> DocumentCorpus:
    if not document_ids or len(document_ids) > 5:
        raise ValueError("Corpus must contain 1–5 documents")
    uuids = [uuid.UUID(d) for d in document_ids]
    async with AsyncSessionLocal() as session:
        docs = (
            await session.execute(
                select(IngestedDocument).where(IngestedDocument.id.in_(uuids))
            )
        ).scalars().all()
        if len(docs) != len(uuids):
            raise ValueError("One or more documents not found")
        for doc in docs:
            if doc.user_id and doc.user_id != user_id:
                raise ValueError("Document access denied")
        row = DocumentCorpus(
            user_id=user_id,
            ticker=ticker.upper() if ticker else None,
            name=name,
            document_ids=[str(d) for d in uuids],
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


async def get_corpus(corpus_id: str, user_id: str | None = None) -> DocumentCorpus | None:
    try:
        cid = uuid.UUID(corpus_id)
    except ValueError:
        return None
    async with AsyncSessionLocal() as session:
        row = await session.get(DocumentCorpus, cid)
        if not row:
            return None
        if user_id and row.user_id != user_id:
            return None
        return row


async def get_corpus_for_ticker(user_id: str, ticker: str) -> DocumentCorpus | None:
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                select(DocumentCorpus)
                .where(
                    DocumentCorpus.user_id == user_id,
                    DocumentCorpus.ticker == ticker.upper(),
                )
                .order_by(DocumentCorpus.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        return row


async def synthesize_corpus_thesis(corpus_id: str) -> dict[str, Any]:
    """Cross-document synthesis using extractions + RAG chunks per doc."""
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY not set")

    async with AsyncSessionLocal() as session:
        corpus = await session.get(DocumentCorpus, uuid.UUID(corpus_id))
        if not corpus:
            raise ValueError("Corpus not found")
        doc_ids = [uuid.UUID(d) for d in (corpus.document_ids or [])]
        docs = (
            await session.execute(
                select(IngestedDocument).where(IngestedDocument.id.in_(doc_ids))
            )
        ).scalars().all()

    doc_payloads = []
    rag_snippets: list[str] = []
    ticker = corpus.ticker or (docs[0].ticker_guess if docs else None)
    for doc in docs:
        extraction = doc.extraction or {}
        doc_payloads.append(
            {
                "document_id": str(doc.id),
                "filename": doc.filename,
                "extraction": {
                    "thesis_points": extraction.get("thesis_points", []),
                    "key_risks": extraction.get("key_risks", []),
                    "target_price": extraction.get("target_price"),
                    "rating": extraction.get("rating"),
                },
            }
        )
        if ticker:
            chunks = await retrieve(
                ticker=ticker,
                query=f"investment thesis {doc.filename}",
                filters={"document_ids": [str(doc.id)]},
                top_k=3,
            )
            for c in chunks:
                rag_snippets.append(f"[{doc.filename}] {c.get('chunk_text', '')[:400]}")

    user_msg = (
        f"Synthesize from {len(doc_payloads)} documents:\n\n"
        f"{json.dumps(doc_payloads, indent=2)}\n\n"
        f"RAG snippets:\n" + "\n".join(rag_snippets[:15])
    )
    merged = await asyncio.to_thread(_call_cerebras_sync, SYNTHESIS_PROMPT, user_msg)

    for i, point in enumerate(merged.get("thesis_points", [])):
        point.setdefault("id", i + 1)
        point.setdefault("status", "PENDING")
        point.setdefault("current_value", "Awaiting live data")

    async with AsyncSessionLocal() as session:
        corpus = await session.get(DocumentCorpus, uuid.UUID(corpus_id))
        if corpus:
            corpus.merged_extraction = merged
            await session.commit()

    return merged


async def get_corpus_detail(corpus_id: str, user_id: str | None = None) -> dict | None:
    corpus = await get_corpus(corpus_id, user_id)
    if not corpus:
        return None
    doc_ids = [uuid.UUID(d) for d in (corpus.document_ids or [])]
    async with AsyncSessionLocal() as session:
        docs = (
            await session.execute(
                select(IngestedDocument).where(IngestedDocument.id.in_(doc_ids))
            )
        ).scalars().all()
    return {
        "id": str(corpus.id),
        "name": corpus.name,
        "ticker": corpus.ticker,
        "document_ids": corpus.document_ids,
        "merged_extraction": corpus.merged_extraction,
        "created_at": corpus.created_at.isoformat(),
        "documents": [
            {
                "id": str(d.id),
                "filename": d.filename,
                "ticker_guess": d.ticker_guess,
                "extraction": d.extraction,
            }
            for d in docs
        ],
    }
