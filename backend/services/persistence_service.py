"""Persist analyses, ingests, health snapshots, and portfolio data."""
import logging
from typing import Any, Optional

from sqlalchemy import select

from database import AsyncSessionLocal
from models import IngestedDocument, PortfolioSnapshot, ThesisAnalysis, ThesisHealthSnapshot

logger = logging.getLogger(__name__)


async def save_analysis(
    ticker: str,
    scenario: dict,
    result: dict,
    user_id: Optional[str] = None,
    org_id=None,
) -> Optional[str]:
    try:
        memo = result.get("memo") or {}
        ss = result.get("sovereign_score")
        score_val = ss if isinstance(ss, (int, float)) else (ss or {}).get("score")
        async with AsyncSessionLocal() as session:
            row = ThesisAnalysis(
                ticker=ticker.upper(),
                scenario=scenario,
                result=result,
                user_id=user_id,
                org_id=org_id,
                sovereign_score=score_val,
                distribution=memo.get("distribution"),
            )
            session.add(row)

            snapshot = PortfolioSnapshot(
                ticker=ticker.upper(),
                scenario=scenario,
                thesis_points=result.get("thesis_points") or [],
                memo_rating=memo.get("rating"),
                user_id=user_id,
                org_id=org_id,
            )
            session.add(snapshot)
            await session.commit()
            return str(row.id)
    except Exception as e:
        logger.warning("Failed to persist analysis: %s", e)
        return None


async def save_health_snapshot(
    ticker: str,
    result: dict,
    user_id: Optional[str] = None,
    org_id=None,
) -> Optional[str]:
    try:
        memo = result.get("memo") or {}
        ss = result.get("sovereign_score")
        score_val = ss if isinstance(ss, (int, float)) else float((ss or {}).get("score") or memo.get("confidence_score", 5) * 10)
        async with AsyncSessionLocal() as session:
            row = ThesisHealthSnapshot(
                user_id=user_id,
                org_id=org_id,
                ticker=ticker.upper(),
                score=float(score_val),
                target=float(memo.get("price_target") or 0),
                distribution=memo.get("distribution"),
                status=memo.get("rating"),
            )
            session.add(row)
            await session.commit()
            return str(row.id)
    except Exception as e:
        logger.warning("Failed to persist health snapshot: %s", e)
        return None


async def find_duplicate_ingestion(
    content_hash: str,
    user_id: Optional[str] = None,
) -> Optional[str]:
    """Return existing document id if same content hash was already ingested."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(IngestedDocument)
                .where(IngestedDocument.content_hash == content_hash)
                .order_by(IngestedDocument.created_at.desc())
            )
            if user_id:
                stmt = stmt.where(
                    (IngestedDocument.user_id == user_id) | (IngestedDocument.user_id.is_(None))
                )
            row = (await session.execute(stmt.limit(1))).scalar_one_or_none()
            if row:
                return str(row.id)
    except Exception as e:
        logger.warning("Duplicate check failed: %s", e)
    return None


async def save_ingestion(
    filename: str,
    file_size_kb: float,
    extraction: dict,
    user_id: Optional[str] = None,
    raw_text: Optional[str] = None,
    content_hash: Optional[str] = None,
) -> Optional[str]:
    try:
        async with AsyncSessionLocal() as session:
            row = IngestedDocument(
                filename=filename,
                file_size_kb=file_size_kb,
                extraction=extraction,
                user_id=user_id,
                raw_text=raw_text,
                ticker_guess=extraction.get("ticker_guess"),
                content_hash=content_hash or extraction.get("content_hash"),
                tags=extraction.get("tags") or [],
            )
            session.add(row)
            await session.commit()
            return str(row.id)
    except Exception as e:
        logger.warning("Failed to persist ingestion: %s", e)
        return None


async def get_analysis_history(
    ticker: str,
    limit: int = 20,
    user_id: Optional[str] = None,
    org_id=None,
) -> list[dict[str, Any]]:
    try:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(ThesisAnalysis)
                .where(ThesisAnalysis.ticker == ticker.upper())
                .order_by(ThesisAnalysis.created_at.desc())
                .limit(limit)
            )
            if user_id:
                stmt = stmt.where(ThesisAnalysis.user_id == user_id)
            if org_id:
                stmt = stmt.where(
                    (ThesisAnalysis.org_id == org_id) | (ThesisAnalysis.org_id.is_(None))
                )
            rows = (await session.execute(stmt)).scalars().all()
            return [
                {
                    "id": str(row.id),
                    "ticker": row.ticker,
                    "scenario": row.scenario,
                    "memo": (row.result or {}).get("memo"),
                    "thesis_points": (row.result or {}).get("thesis_points"),
                    "sovereign_score": (row.result or {}).get("sovereign_score"),
                    "pipeline_elapsed_seconds": (row.result or {}).get("pipeline_elapsed_seconds"),
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]
    except Exception as e:
        logger.warning("Failed to load analysis history: %s", e)
        return []
