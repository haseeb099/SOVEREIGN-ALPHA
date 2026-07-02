"""Org API keys — admin CRUD for enterprise tier keys."""
from __future__ import annotations

import hashlib
import secrets
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from models import ApiKey
from services.audit_service import record_event
from services.permission_service import get_org_id, require_permission

router = APIRouter()

TIER_LIMITS = {
    "free": 50,
    "demo": 50,
    "pro": 10000,
    "enterprise": 100000,
}


class ApiKeyCreate(BaseModel):
    plan_tier: str = Field("pro", pattern="^(free|pro|enterprise)$")


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@router.get("/api-keys")
async def list_api_keys(request: Request):
    require_permission(request, "api_keys:read")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(select(ApiKey).where(ApiKey.org_id == org_id))
        ).scalars().all()
        return {
            "keys": [
                {
                    "id": str(r.id),
                    "plan_tier": r.plan_tier,
                    "rate_limit": r.rate_limit,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
        }


@router.post("/api-keys")
async def create_api_key(body: ApiKeyCreate, request: Request):
    user_id = require_permission(request, "api_keys:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    raw_key = f"sa_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(raw_key)
    rate_limit = TIER_LIMITS.get(body.plan_tier, 50)
    async with AsyncSessionLocal() as session:
        row = ApiKey(
            user_id=user_id,
            org_id=org_id,
            key_hash=key_hash,
            plan_tier=body.plan_tier,
            rate_limit=rate_limit,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    await record_event(
        org_id, user_id, "api_key.create", "api_key", str(row.id), {"plan_tier": body.plan_tier}
    )
    return {
        "id": str(row.id),
        "key": raw_key,
        "plan_tier": body.plan_tier,
        "rate_limit": rate_limit,
        "warning": "Store this key securely — it will not be shown again.",
    }


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(key_id: str, request: Request):
    user_id = require_permission(request, "api_keys:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    try:
        kid = uuid.UUID(key_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid key id")
    async with AsyncSessionLocal() as session:
        row = await session.get(ApiKey, kid)
        if not row or row.org_id != org_id:
            raise HTTPException(status_code=404, detail="API key not found")
        await session.delete(row)
        await session.commit()
    await record_event(org_id, user_id, "api_key.revoke", "api_key", key_id)
    return {"status": "revoked", "id": key_id}
