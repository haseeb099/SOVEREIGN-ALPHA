"""
/api/ingest — Document upload and thesis extraction
Accepts PDF, TXT, JSON files and returns extracted thesis points.
"""
import hashlib
import os

from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Form
from services.ingest_service import extract_thesis_from_document
from services.persistence_service import find_duplicate_ingestion, save_ingestion
from services.retrieval_service import index_document
from services.corpus_service import create_corpus, get_corpus_detail, synthesize_corpus_thesis

router = APIRouter()

MAX_SIZE = 10 * 1024 * 1024
ALLOWED_TYPES = {".pdf", ".txt", ".json", ".docx"}


async def _ingest_one(
    contents: bytes,
    filename: str,
    user_id: str | None,
) -> dict:
    content_hash = hashlib.sha256(contents).hexdigest()
    existing_id = await find_duplicate_ingestion(content_hash, user_id)
    if existing_id:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Document already uploaded",
                "existing_id": existing_id,
            },
        )

    result = await extract_thesis_from_document(contents, filename)
    result["content_hash"] = content_hash
    raw_text = result.pop("raw_text", None)
    file_size_kb = round(len(contents) / 1024, 1)
    doc_id = await save_ingestion(
        filename,
        file_size_kb,
        result,
        user_id=user_id,
        raw_text=raw_text,
        content_hash=content_hash,
    )
    if doc_id is None:
        raise HTTPException(
            status_code=500,
            detail="Document extracted but failed to save.",
        )
    if raw_text and doc_id:
        await index_document(
            document_id=doc_id,
            raw_text=raw_text,
            ticker=result.get("ticker_guess"),
            page_refs=result.get("page_refs"),
        )
    return {
        "filename": filename,
        "file_size_kb": file_size_kb,
        "document_id": doc_id,
        "extraction": result,
    }


@router.post("/ingest")
async def ingest_document(request: Request, file: UploadFile = File(...)):
    """
    Upload an institutional document (10-K, analyst memo, PDF).
    Returns extracted thesis points for the Thesis Tracker™.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {ALLOWED_TYPES}",
        )

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 10MB.")

    user_id = getattr(request.state, "user_id", None)
    try:
        return await _ingest_one(contents, file.filename or "document", user_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")


@router.post("/ingest/batch")
async def ingest_batch(
    request: Request,
    files: list[UploadFile] = File(...),
    ticker: str | None = Form(None),
    name: str | None = Form(None),
):
    """Upload up to 5 documents and create a research corpus."""
    if len(files) < 1 or len(files) > 5:
        raise HTTPException(status_code=400, detail="Batch ingest requires 1–5 files")

    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    document_ids: list[str] = []
    extractions: list[dict] = []

    for file in files:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
        contents = await file.read()
        if len(contents) > MAX_SIZE:
            raise HTTPException(status_code=413, detail=f"{file.filename} exceeds 10MB limit")
        try:
            result = await _ingest_one(contents, file.filename or "document", user_id)
            document_ids.append(result["document_id"])
            extractions.append(result["extraction"])
        except HTTPException as e:
            if e.status_code == 409:
                detail = e.detail if isinstance(e.detail, dict) else {}
                existing = detail.get("existing_id")
                if existing:
                    document_ids.append(existing)
                    continue
            raise

    corpus_ticker = ticker or next(
        (e.get("ticker_guess") for e in extractions if e.get("ticker_guess")),
        None,
    )
    corpus_name = name or f"Research bundle ({len(document_ids)} docs)"
    corpus = await create_corpus(user_id, corpus_ticker, corpus_name, document_ids)
    merged = await synthesize_corpus_thesis(str(corpus.id))

    return {
        "corpus_id": str(corpus.id),
        "document_ids": document_ids,
        "merged_extraction": merged,
    }


@router.get("/ingest/corpus/{corpus_id}")
async def get_corpus(request: Request, corpus_id: str):
    user_id = getattr(request.state, "user_id", None)
    detail = await get_corpus_detail(corpus_id, user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Corpus not found")
    return detail


@router.post("/ingest/corpus/{corpus_id}/synthesize")
async def resynthesize_corpus(request: Request, corpus_id: str):
    user_id = getattr(request.state, "user_id", None)
    detail = await get_corpus_detail(corpus_id, user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Corpus not found")
    try:
        merged = await synthesize_corpus_thesis(corpus_id)
        return {"corpus_id": corpus_id, "merged_extraction": merged}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
