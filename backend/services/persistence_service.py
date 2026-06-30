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
) -> Optional[str]:
    try:
        memo = result.get("memo") or {}
        ss = result.get("sovereign_score")
        score_val = ss if isinstance(ss, (int, float)) else float((ss or {}).get("score") or memo.get("confidence_score", 5) * 10)
        async with AsyncSessionLocal() as session:
            row = ThesisHealthSnapshot(
                user_id=user_id,
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
            stmt = select(IngestedDocument).order_by(IngestedDocument.created_at.desc())
            rows = (await session.execute(stmt)).scalars().all()
            for row in rows:
                extraction = row.extraction or {}
                if extraction.get("content_hash") != content_hash:
                    continue
                if user_id and row.user_id and row.user_id != user_id:
                    continue
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
                tags=extraction.get("tags") or [],
            )
            session.add(row)
            await session.commit()
            return str(row.id)
    except Exception as e:
        logger.warning("Failed to persist ingestion: %s", e)
        return None


async def get_analysis_history(ticker: str, limit: int = 20) -> list[dict[str, Any]]:
    try:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(ThesisAnalysis)
                .where(ThesisAnalysis.ticker == ticker.upper())
                .order_by(ThesisAnalysis.created_at.desc())
                .limit(limit)
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
