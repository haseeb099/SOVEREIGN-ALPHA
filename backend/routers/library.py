"""Document library — user-scoped ingested documents."""
import uuid

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import delete, select

from database import AsyncSessionLocal
from middleware.auth import extract_user_id
from models import DocumentChunk, DocumentLibraryItem, IngestedDocument

router = APIRouter()


def _require_user(request: Request) -> str:
    user_id = extract_user_id(request) or getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


@router.get("/library")
async def list_library(request: Request):
    user_id = _require_user(request)
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(DocumentLibraryItem)
                .where(DocumentLibraryItem.user_id == user_id)
                .order_by(DocumentLibraryItem.created_at.desc())
            )
        ).scalars().all()
        if rows:
            return {
                "documents": [
                    {
                        "id": str(r.id),
                        "filename": r.filename,
                        "ticker_guess": r.ticker_guess,
                        "tags": r.tags or [],
                        "extraction": r.extraction,
                        "created_at": r.created_at.isoformat(),
                    }
                    for r in rows
                ]
            }
        docs = (
            await session.execute(
                select(IngestedDocument)
                .where(IngestedDocument.user_id == user_id)
                .order_by(IngestedDocument.created_at.desc())
            )
        ).scalars().all()
        return {
            "documents": [
                {
                    "id": str(d.id),
                    "filename": d.filename,
                    "ticker_guess": d.ticker_guess,
                    "tags": d.tags or [],
                    "extraction": d.extraction,
                    "created_at": d.created_at.isoformat(),
                }
                for d in docs
            ]
        }


@router.get("/library/{doc_id}")
async def get_document(request: Request, doc_id: str):
    user_id = _require_user(request)
    import uuid

    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                select(IngestedDocument).where(IngestedDocument.id == uuid.UUID(doc_id))
            )
        ).scalar_one_or_none()
        if not row or (row.user_id and row.user_id != user_id):
            raise HTTPException(status_code=404, detail="Document not found")
        return {
            "id": str(row.id),
            "filename": row.filename,
            "extraction": row.extraction,
            "raw_text_preview": (row.raw_text or "")[:2000],
            "ticker_guess": row.ticker_guess,
            "tags": row.tags or [],
        }


@router.delete("/library/{doc_id}")
async def delete_document(request: Request, doc_id: str):
    user_id = _require_user(request)
    import uuid

    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                select(IngestedDocument).where(IngestedDocument.id == uuid.UUID(doc_id))
            )
        ).scalar_one_or_none()
        if not row or (row.user_id and row.user_id != user_id):
            raise HTTPException(status_code=404, detail="Document not found")
        await session.execute(
            delete(DocumentChunk).where(DocumentChunk.document_id == str(row.id))
        )
        await session.delete(row)
        await session.commit()
        return {"deleted": doc_id}
