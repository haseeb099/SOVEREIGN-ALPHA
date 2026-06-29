"""Persist analyses, ingests, and portfolio snapshots to PostgreSQL."""
import logging
from typing import Any, Optional

from sqlalchemy import select

from database import AsyncSessionLocal
from models import IngestedDocument, PortfolioSnapshot, ThesisAnalysis

logger = logging.getLogger(__name__)


async def save_analysis(ticker: str, scenario: dict, result: dict) -> Optional[str]:
    try:
        async with AsyncSessionLocal() as session:
            row = ThesisAnalysis(ticker=ticker.upper(), scenario=scenario, result=result)
            session.add(row)

            snapshot = PortfolioSnapshot(
                ticker=ticker.upper(),
                scenario=scenario,
                thesis_points=result.get("thesis_points") or [],
                memo_rating=(result.get("memo") or {}).get("rating"),
            )
            session.add(snapshot)
            await session.commit()
            return str(row.id)
    except Exception as e:
        logger.warning("Failed to persist analysis: %s", e)
        return None


async def save_ingestion(filename: str, file_size_kb: float, extraction: dict) -> Optional[str]:
    try:
        async with AsyncSessionLocal() as session:
            row = IngestedDocument(
                filename=filename,
                file_size_kb=file_size_kb,
                extraction=extraction,
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
                    "pipeline_elapsed_seconds": (row.result or {}).get("pipeline_elapsed_seconds"),
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]
    except Exception as e:
        logger.warning("Failed to load analysis history: %s", e)
        return []
