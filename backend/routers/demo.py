"""Demo environment status."""
from __future__ import annotations

import os

from fastapi import APIRouter
from sqlalchemy import func, select

from database import AsyncSessionLocal
from models import Holding, SharedThesis, ThesisAnalysis
from services.db_guard import db_skipped

router = APIRouter()

DEMO_USER_ID = "demo-seed-user"


@router.get("/demo/status")
async def demo_status():
    demo_mode = os.environ.get("DEMO_MODE", "true").lower() == "true"
    seeded = False
    analysis_count = 0
    holding_count = 0
    thesis_count = 0

    if not db_skipped():
        try:
            async with AsyncSessionLocal() as session:
                analysis_count = (
                    await session.execute(
                        select(func.count())
                        .select_from(ThesisAnalysis)
                        .where(ThesisAnalysis.user_id == DEMO_USER_ID)
                    )
                ).scalar() or 0
                holding_count = (
                    await session.execute(
                        select(func.count())
                        .select_from(Holding)
                        .where(Holding.user_id == DEMO_USER_ID)
                    )
                ).scalar() or 0
                thesis_count = (
                    await session.execute(select(func.count()).select_from(SharedThesis))
                ).scalar() or 0
                seeded = analysis_count >= 3
        except Exception:
            pass

    return {
        "demo_mode": demo_mode,
        "seeded": seeded,
        "analysis_count": analysis_count,
        "holding_count": holding_count,
        "shared_thesis_count": thesis_count,
        "demo_user_id": DEMO_USER_ID,
        "launch_url": "/terminal/TSLA/memo?demo=1",
    }
