#!/usr/bin/env python3
"""Seed demo tenant with pre-run analyses, holdings, and shared theses."""
from __future__ import annotations

import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

DEMO_USER_ID = "demo-seed-user"
DEMO_ORG_SLUG = "demo-org"
TICKERS = ("TSLA", "NVDA", "AAPL")


def _demo_analysis(ticker: str) -> dict:
  scores = {"TSLA": 72.5, "NVDA": 81.2, "AAPL": 68.0}
  summaries = {
      "TSLA": "Margins intact; FSD timeline risk",
      "NVDA": "AI capex cycle supports demand",
      "AAPL": "Services mix offsets hardware cyclicality",
  }
  score = scores[ticker]
  return {
      "ticker": ticker,
      "asset_price": 185.0,
      "asset_change_pct": 2.1 if ticker == "NVDA" else -1.2,
      "memo": {
          "summary": summaries[ticker],
          "bull_verdict": f"{ticker} structural advantages remain.",
          "bear_verdict": f"{ticker} faces competitive and macro headwinds.",
          "rating": "BULLISH" if score > 70 else "NEUTRAL",
          "confidence_score": score / 10,
      },
      "thesis_points": [
          {
              "id": 1,
              "text": "Revenue growth above sector median",
              "metric": "Growth",
              "status": "PASS",
          }
      ],
  }


async def seed() -> None:
    from sqlalchemy import select

    from database import AsyncSessionLocal, init_db
    from models import Holding, Organisation, OrgMembership, SharedThesis, ThesisAnalysis, Workspace

    await init_db()

    async with AsyncSessionLocal() as session:
        org = (
            await session.execute(select(Organisation).where(Organisation.slug == DEMO_ORG_SLUG))
        ).scalar_one_or_none()
        if not org:
            org = Organisation(id=uuid.uuid4(), name="Demo Org", slug=DEMO_ORG_SLUG)
            session.add(org)
            await session.flush()

        membership = (
            await session.execute(
                select(OrgMembership).where(
                    OrgMembership.org_id == org.id,
                    OrgMembership.user_id == DEMO_USER_ID,
                )
            )
        ).scalar_one_or_none()
        if not membership:
            session.add(
                OrgMembership(org_id=org.id, user_id=DEMO_USER_ID, role="admin", status="active")
            )

        ws = (
            await session.execute(select(Workspace).where(Workspace.org_id == org.id))
        ).scalar_one_or_none()
        if not ws:
            ws = Workspace(org_id=org.id, name="Demo Workspace", created_by=DEMO_USER_ID)
            session.add(ws)
            await session.flush()

        for ticker in TICKERS:
            existing = (
                await session.execute(
                    select(ThesisAnalysis).where(
                        ThesisAnalysis.user_id == DEMO_USER_ID,
                        ThesisAnalysis.ticker == ticker,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                continue
            result = _demo_analysis(ticker)
            analysis = ThesisAnalysis(
                user_id=DEMO_USER_ID,
                org_id=org.id,
                ticker=ticker,
                scenario={"margins": 18, "rates": 4.5, "regulatory": "Low", "sentiment": "Neutral"},
                result=result,
                sovereign_score={"TSLA": 72.5, "NVDA": 81.2, "AAPL": 68.0}[ticker],
            )
            session.add(analysis)
            await session.flush()
            session.add(
                SharedThesis(
                    workspace_id=ws.id,
                    ticker=ticker,
                    analysis_id=analysis.id,
                    status="published",
                    shared_by=DEMO_USER_ID,
                )
            )

        for ticker, shares in (("TSLA", 100), ("NVDA", 50), ("SPY", 200)):
            existing_h = (
                await session.execute(
                    select(Holding).where(
                        Holding.user_id == DEMO_USER_ID,
                        Holding.ticker == ticker,
                    )
                )
            ).scalar_one_or_none()
            if not existing_h:
                session.add(
                    Holding(
                        user_id=DEMO_USER_ID,
                        org_id=org.id,
                        ticker=ticker,
                        shares=shares,
                        cost_basis=100.0,
                    )
                )

        await session.commit()
    print("Demo seed complete:", DEMO_USER_ID, list(TICKERS))


if __name__ == "__main__":
    asyncio.run(seed())
