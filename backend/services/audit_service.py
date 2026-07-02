"""Append-only audit event logging with optional checksum chain."""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select

from database import AsyncSessionLocal
from models import AuditEvent

logger = logging.getLogger(__name__)


def _compute_checksum(
    org_id: uuid.UUID | None,
    actor_id: str | None,
    action: str,
    resource_type: str | None,
    resource_id: str | None,
    payload: dict | None,
    prior_checksum: str | None,
) -> str:
    blob = json.dumps(
        {
            "org_id": str(org_id) if org_id else None,
            "actor_id": actor_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "payload": payload or {},
            "prior_checksum": prior_checksum,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


async def _get_prior_checksum(org_id: uuid.UUID | None) -> str | None:
    if not org_id:
        return None
    try:
        async with AsyncSessionLocal() as session:
            row = (
                await session.execute(
                    select(AuditEvent.checksum)
                    .where(AuditEvent.org_id == org_id)
                    .order_by(desc(AuditEvent.created_at))
                    .limit(1)
                )
            ).scalar_one_or_none()
            return row
    except Exception:
        return None


async def record_event(
    org_id: uuid.UUID | None,
    actor_id: str | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    payload: dict | None = None,
    *,
    chain: bool = True,
) -> str | None:
    """Insert-only audit event. Returns event id or None on failure."""
    if not org_id:
        return None
    try:
        prior = await _get_prior_checksum(org_id) if chain else None
        full_payload = dict(payload or {})
        if prior:
            full_payload["prior_checksum"] = prior
        checksum = _compute_checksum(
            org_id, actor_id, action, resource_type, resource_id, full_payload, prior
        )
        async with AsyncSessionLocal() as session:
            row = AuditEvent(
                id=uuid.uuid4(),
                org_id=org_id,
                actor_id=actor_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                payload=full_payload,
                checksum=checksum,
                created_at=datetime.now(timezone.utc),
            )
            session.add(row)
            await session.commit()
            return str(row.id)
    except Exception as exc:
        logger.warning("Audit record failed: %s", exc)
        return None


async def list_events(
    org_id: uuid.UUID,
    *,
    action: str | None = None,
    resource_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(AuditEvent).where(AuditEvent.org_id == org_id)
            if action:
                stmt = stmt.where(AuditEvent.action == action)
            if resource_type:
                stmt = stmt.where(AuditEvent.resource_type == resource_type)
            stmt = stmt.order_by(desc(AuditEvent.created_at)).offset(offset).limit(limit)
            rows = (await session.execute(stmt)).scalars().all()
            return [
                {
                    "id": str(r.id),
                    "org_id": str(r.org_id) if r.org_id else None,
                    "actor_id": r.actor_id,
                    "action": r.action,
                    "resource_type": r.resource_type,
                    "resource_id": r.resource_id,
                    "payload": r.payload,
                    "checksum": r.checksum,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
    except Exception as exc:
        logger.warning("Audit list failed: %s", exc)
        return []


async def export_events(org_id: uuid.UUID, fmt: str = "json") -> str:
    events = await list_events(org_id, limit=10000)
    if fmt == "csv":
        lines = ["id,org_id,actor_id,action,resource_type,resource_id,checksum,created_at"]
        for e in events:
            lines.append(
                ",".join(
                    [
                        e["id"],
                        e.get("org_id") or "",
                        e.get("actor_id") or "",
                        e["action"],
                        e.get("resource_type") or "",
                        e.get("resource_id") or "",
                        e.get("checksum") or "",
                        e.get("created_at") or "",
                    ]
                )
            )
        return "\n".join(lines)
    return json.dumps(events, indent=2, default=str)
