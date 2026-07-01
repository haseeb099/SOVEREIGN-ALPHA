"""POST /api/feedback — user feedback on memo sections."""
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from database import AsyncSessionLocal
from middleware.auth import extract_user_id
from models import MemoFeedback

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_SECTIONS = {"summary", "bull", "bear", "thesis_3", "fundamental", "macro", "synthesis"}
VALID_VOTES = {"up", "down"}


class FeedbackRequest(BaseModel):
    analysis_id: Optional[str] = None
    ticker: str = Field(..., min_length=1, max_length=16)
    section: str
    vote: str
    comment: Optional[str] = None


@router.post("/feedback")
async def submit_feedback(body: FeedbackRequest, request: Request):
    section = body.section.lower()
    vote = body.vote.lower()
    if section not in VALID_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section. Allowed: {VALID_SECTIONS}")
    if vote not in VALID_VOTES:
        raise HTTPException(status_code=400, detail=f"Invalid vote. Allowed: {VALID_VOTES}")

    user_id = extract_user_id(request) or getattr(request.state, "user_id", None)
    analysis_uuid = None
    if body.analysis_id:
        try:
            analysis_uuid = uuid.UUID(body.analysis_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid analysis_id")

    try:
        async with AsyncSessionLocal() as session:
            row = MemoFeedback(
                user_id=user_id,
                analysis_id=analysis_uuid,
                ticker=body.ticker.upper(),
                section=section,
                vote=vote,
                comment=body.comment,
            )
            session.add(row)
            await session.commit()
            return {"id": str(row.id), "status": "recorded"}
    except SQLAlchemyError as e:
        logger.warning("Feedback persist failed: %s", e)
        raise HTTPException(status_code=503, detail="Failed to save feedback")
