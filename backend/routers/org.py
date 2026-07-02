"""Organisation branding and member management."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from models import Organisation, OrgMembership
from services.audit_service import record_event
from services.permission_service import get_org_id, require_permission

router = APIRouter()

DEFAULT_BRANDING = {
    "firm_name": "Sovereign-Alpha",
    "product_name": "Sovereign-Alpha",
    "primary_color": "#e5a00d",
    "logo_url": None,
    "favicon_url": "/favicon.svg",
    "disclaimer": "Not investment advice.",
}


class BrandingUpdate(BaseModel):
    firm_name: str | None = None
    product_name: str | None = None
    primary_color: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    disclaimer: str | None = None


class MemberInvite(BaseModel):
    user_id: str
    role: str = Field("viewer", pattern="^(admin|analyst|viewer)$")


@router.get("/org/branding")
async def get_org_branding(request: Request):
    org_id = get_org_id(request)
    if not org_id:
        return DEFAULT_BRANDING
    try:
        async with AsyncSessionLocal() as session:
            org = await session.get(Organisation, org_id)
            if org and org.branding:
                return {**DEFAULT_BRANDING, **org.branding}
    except Exception:
        pass
    return DEFAULT_BRANDING


@router.put("/org/branding")
async def update_org_branding(body: BrandingUpdate, request: Request):
    user_id = require_permission(request, "org:settings")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    branding_patch = body.model_dump(exclude_none=True)
    async with AsyncSessionLocal() as session:
        org = await session.get(Organisation, org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organisation not found")
        org.branding = {**(org.branding or DEFAULT_BRANDING), **branding_patch}
        await session.commit()
    await record_event(org_id, user_id, "org.branding_update", "organisation", str(org_id), branding_patch)
    return org.branding


@router.get("/org/members")
async def list_org_members(request: Request):
    require_permission(request, "members:read")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(OrgMembership).where(OrgMembership.org_id == org_id)
            )
        ).scalars().all()
        return {
            "members": [
                {"user_id": r.user_id, "role": r.role, "status": r.status} for r in rows
            ]
        }


@router.post("/org/members")
async def add_org_member(body: MemberInvite, request: Request):
    user_id = require_permission(request, "members:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    async with AsyncSessionLocal() as session:
        existing = (
            await session.execute(
                select(OrgMembership).where(
                    OrgMembership.org_id == org_id,
                    OrgMembership.user_id == body.user_id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.role = body.role
            existing.status = "active"
        else:
            session.add(
                OrgMembership(org_id=org_id, user_id=body.user_id, role=body.role)
            )
        await session.commit()
    await record_event(
        org_id, user_id, "member.add", "org_membership", body.user_id, {"role": body.role}
    )
    return {"user_id": body.user_id, "role": body.role, "status": "active"}


@router.delete("/org/members/{member_user_id}")
async def remove_org_member(member_user_id: str, request: Request):
    user_id = require_permission(request, "members:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                select(OrgMembership).where(
                    OrgMembership.org_id == org_id,
                    OrgMembership.user_id == member_user_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Member not found")
        row.status = "inactive"
        await session.commit()
    await record_event(org_id, user_id, "member.remove", "org_membership", member_user_id)
    return {"user_id": member_user_id, "status": "inactive"}
