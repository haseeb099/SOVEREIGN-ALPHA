"""Alert rules and in-process evaluation on analyze completion."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from middleware.auth import require_auth
from models import AlertRule, ThesisHealthSnapshot
from services.market_service import get_market_data

logger = logging.getLogger(__name__)
router = APIRouter()


class AlertRuleCreate(BaseModel):
    ticker: str
    condition: str = Field(..., pattern="^(thesis_score_drop|status_change|price_move|earnings_7d)$")
    channel: str = "in_app"
    threshold: float | None = None
    destination: str | None = None


def _require_user(request: Request) -> str:
    return require_auth(request)


@router.get("/alerts/rules")
async def list_rules(request: Request):
    user_id = _require_user(request)
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(select(AlertRule).where(AlertRule.user_id == user_id))
        ).scalars().all()
        return {
            "rules": [
                {
                    "id": str(r.id),
                    "ticker": r.ticker,
                    "condition": r.condition,
                    "channel": r.channel,
                    "threshold": r.threshold,
                    "active": r.active,
                    "destination": (r.config or {}).get("destination"),
                }
                for r in rows
            ]
        }


@router.post("/alerts/rules")
async def create_rule(request: Request, body: AlertRuleCreate):
    user_id = _require_user(request)
    async with AsyncSessionLocal() as session:
        config = {}
        if body.destination:
            config["destination"] = body.destination
        row = AlertRule(
            user_id=user_id,
            ticker=body.ticker.upper(),
            condition=body.condition,
            channel=body.channel,
            threshold=body.threshold,
            config=config or None,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return {"id": str(row.id), "ticker": row.ticker, "condition": row.condition}


@router.delete("/alerts/rules/{rule_id}")
async def delete_rule(request: Request, rule_id: str):
    user_id = _require_user(request)
    import uuid

    async with AsyncSessionLocal() as session:
        row = await session.get(AlertRule, uuid.UUID(rule_id))
        if not row or row.user_id != user_id:
            raise HTTPException(status_code=404, detail="Rule not found")
        await session.delete(row)
        await session.commit()
        return {"deleted": rule_id}


@router.get("/alerts/notifications")
async def notifications(request: Request):
    """In-app notifications from recent alert evaluations."""
    user_id = _require_user(request)
    alerts = await evaluate_rules_for_user(user_id)
    return {"notifications": alerts}


async def evaluate_rules_for_ticker(
    ticker: str,
    user_id: str | None = None,
    latest_analysis: dict | None = None,
) -> list[dict]:
    """Evaluate active rules for a ticker — called after analyze completes."""
    fired: list[dict] = []
    symbol = ticker.upper()
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(AlertRule).where(
                AlertRule.ticker == symbol,
                AlertRule.active == True,  # noqa: E712
            )
            if user_id:
                stmt = stmt.where(AlertRule.user_id == user_id)
            rules = (await session.execute(stmt)).scalars().all()

            for rule in rules:
                notification = await _evaluate_rule(session, rule, latest_analysis)
                if notification:
                    fired.append(notification)
    except Exception as exc:
        logger.warning("Alert evaluation failed for %s: %s", symbol, exc)
    return fired


async def evaluate_rules_for_user(user_id: str) -> list[dict]:
    """Evaluate all active rules for a user."""
    fired: list[dict] = []
    try:
        async with AsyncSessionLocal() as session:
            rules = (
                await session.execute(
                    select(AlertRule).where(AlertRule.user_id == user_id, AlertRule.active == True)  # noqa: E712
                )
            ).scalars().all()
            for rule in rules:
                notification = await _evaluate_rule(session, rule, None)
                if notification:
                    fired.append(notification)
    except Exception as exc:
        logger.warning("Alert evaluation failed for user %s: %s", user_id, exc)
    return fired


async def _evaluate_rule(session, rule: AlertRule, latest_analysis: dict | None) -> dict | None:
    snapshots = (
        await session.execute(
            select(ThesisHealthSnapshot)
            .where(
                ThesisHealthSnapshot.ticker == rule.ticker,
                ThesisHealthSnapshot.user_id == rule.user_id,
            )
            .order_by(ThesisHealthSnapshot.created_at.desc())
            .limit(2)
        )
    ).scalars().all()

    if rule.condition == "thesis_score_drop":
        if len(snapshots) < 2:
            return None
        latest, prior = snapshots[0], snapshots[1]
        threshold = rule.threshold or 10
        drop = prior.score - latest.score
        if drop >= threshold:
            return _notification(
                rule,
                f"{rule.ticker} thesis degraded {drop:.0f}pts since "
                f"{prior.created_at.date()} due to score change",
            )

    if rule.condition == "status_change":
        if len(snapshots) < 2:
            return None
        latest, prior = snapshots[0], snapshots[1]
        if latest.status and prior.status and latest.status != prior.status:
            return _notification(
                rule,
                f"{rule.ticker} thesis status changed {prior.status} → {latest.status}",
            )

    if rule.condition == "price_move":
        threshold = rule.threshold or 5.0
        try:
            md = await get_market_data(rule.ticker)
            change = abs(md.get("change_pct", 0))
            if change >= threshold:
                return _notification(
                    rule,
                    f"{rule.ticker} moved {change:.1f}% (threshold {threshold:.0f}%)",
                )
        except Exception:
            return None

    if rule.condition == "earnings_7d":
        if latest_analysis and latest_analysis.get("earnings_overlay"):
            return _notification(rule, f"{rule.ticker} earnings within 7 days — review thesis")

    return None


def _notification(rule: AlertRule, message: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "ticker": rule.ticker,
        "message": message,
        "channel": rule.channel,
        "condition": rule.condition,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
