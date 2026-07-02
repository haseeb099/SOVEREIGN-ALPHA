"""Clerk webhooks — bootstrap Organisation + OrgMembership on org events."""
from __future__ import annotations

import logging
import os
import re
import uuid

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from database import AsyncSessionLocal
from models import Organisation, OrgMembership
from services.db_guard import require_db

router = APIRouter()
logger = logging.getLogger(__name__)

CLERK_WEBHOOK_SECRET = os.environ.get("CLERK_WEBHOOK_SECRET", "")


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:120] or f"org-{uuid.uuid4().hex[:8]}"


async def _upsert_org_from_clerk(data: dict) -> dict:
    clerk_org_id = data.get("id")
    name = data.get("name") or data.get("slug") or "Organisation"
    slug = data.get("slug") or _slugify(name)
    if not clerk_org_id:
        raise HTTPException(status_code=400, detail="Missing org id in webhook payload")

    async with AsyncSessionLocal() as session:
        org = (
            await session.execute(
                select(Organisation).where(Organisation.clerk_org_id == clerk_org_id)
            )
        ).scalar_one_or_none()
        if not org:
            org = (
                await session.execute(select(Organisation).where(Organisation.slug == slug))
            ).scalar_one_or_none()
        if not org:
            org = Organisation(
                id=uuid.uuid4(),
                name=name,
                slug=slug,
                clerk_org_id=clerk_org_id,
            )
            session.add(org)
        else:
            org.name = name
            org.clerk_org_id = clerk_org_id
        await session.commit()
        await session.refresh(org)
    return {"org_id": str(org.id), "clerk_org_id": clerk_org_id, "slug": org.slug}


async def _sync_membership(data: dict) -> dict:
    clerk_org_id = data.get("organization", {}).get("id") or data.get("organization_id")
    user_id = data.get("public_user_data", {}).get("user_id") or data.get("user_id")
    role = (data.get("role") or "org:member").replace("org:", "").lower()
    if role not in ("admin", "analyst", "viewer"):
        role = "viewer" if role == "member" else role
    if not clerk_org_id or not user_id:
        return {"skipped": True}

    async with AsyncSessionLocal() as session:
        org = (
            await session.execute(
                select(Organisation).where(Organisation.clerk_org_id == clerk_org_id)
            )
        ).scalar_one_or_none()
        if not org:
            return {"skipped": True, "reason": "org not found"}
        row = (
            await session.execute(
                select(OrgMembership).where(
                    OrgMembership.org_id == org.id,
                    OrgMembership.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            session.add(
                OrgMembership(org_id=org.id, user_id=user_id, role=role, status="active")
            )
        else:
            row.role = role
            row.status = "active"
        await session.commit()
    return {"org_id": str(org.id), "user_id": user_id, "role": role}


@router.post("/webhooks/clerk")
async def clerk_webhook(request: Request):
    require_db()
    payload = await request.json()
    event_type = payload.get("type", "")
    data = payload.get("data", {})

    if event_type == "organization.created":
        result = await _upsert_org_from_clerk(data)
        return {"received": True, "result": result}
    if event_type in ("organizationMembership.created", "organizationMembership.updated"):
        result = await _sync_membership(data)
        return {"received": True, "result": result}
    if event_type == "organization.updated":
        result = await _upsert_org_from_clerk(data)
        return {"received": True, "result": result}

    return {"received": True, "ignored": event_type}
