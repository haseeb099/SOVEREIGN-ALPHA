"""Multi-tenant context — resolve org_id from Clerk JWT or X-Org-Id header."""
from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

from fastapi import Request
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware

from database import AsyncSessionLocal
from models import Organisation, OrgMembership

logger = logging.getLogger(__name__)

DEV_LOCAL_ORG_SLUG = "dev-local-org"
DEV_LOCAL_ORG_ROLE = "admin"
# Stable fallback UUID when DB unavailable (tests / offline)
DEV_LOCAL_ORG_UUID = uuid.UUID("00000000-0000-4000-8000-000000000001")
_dev_org_bootstrap_failed = False


def dev_tenant_enabled() -> bool:
    return (
        os.environ.get("ENVIRONMENT", "development") == "development"
        and not os.environ.get("CLERK_SECRET_KEY", "")
    )


def _db_skipped() -> bool:
    return os.environ.get("SKIP_DB_INIT", "").lower() in ("1", "true", "yes")


def extract_org_claims(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Return (clerk_org_id, org_role) from JWT claims attached by auth middleware."""
    return (
        getattr(request.state, "clerk_org_id", None),
        getattr(request.state, "org_role", None),
    )


async def _ensure_dev_org() -> uuid.UUID:
    """Create dev-local-org and admin membership for dev-local-user if missing."""
    global _dev_org_bootstrap_failed
    if _dev_org_bootstrap_failed or _db_skipped():
        return DEV_LOCAL_ORG_UUID

    from middleware.auth import DEV_LOCAL_USER

    try:
        async with AsyncSessionLocal() as session:
            org = (
                await session.execute(
                    select(Organisation).where(Organisation.slug == DEV_LOCAL_ORG_SLUG)
                )
            ).scalar_one_or_none()
            if not org:
                org = Organisation(
                    id=uuid.uuid4(),
                    name="Dev Local Org",
                    slug=DEV_LOCAL_ORG_SLUG,
                    branding={
                        "firm_name": "Sovereign-Alpha",
                        "product_name": "Sovereign-Alpha",
                        "primary_color": "#e5a00d",
                    },
                )
                session.add(org)
                await session.flush()

            membership = (
                await session.execute(
                    select(OrgMembership).where(
                        OrgMembership.org_id == org.id,
                        OrgMembership.user_id == DEV_LOCAL_USER,
                    )
                )
            ).scalar_one_or_none()
            if not membership:
                session.add(
                    OrgMembership(
                        org_id=org.id,
                        user_id=DEV_LOCAL_USER,
                        role=DEV_LOCAL_ORG_ROLE,
                        status="active",
                    )
                )
            await session.commit()
            return org.id
    except Exception as exc:
        logger.debug("Dev org bootstrap skipped: %s", exc)
        _dev_org_bootstrap_failed = True
        return DEV_LOCAL_ORG_UUID


async def resolve_org_id(request: Request) -> Optional[uuid.UUID]:
    """Resolve org UUID for the current request."""
    header_org = request.headers.get("X-Org-Id")
    if header_org:
        try:
            return uuid.UUID(header_org)
        except ValueError:
            pass

    clerk_org_id, _ = extract_org_claims(request)
    if clerk_org_id:
        try:
            async with AsyncSessionLocal() as session:
                org = (
                    await session.execute(
                        select(Organisation).where(Organisation.clerk_org_id == clerk_org_id)
                    )
                ).scalar_one_or_none()
                if org:
                    return org.id
        except Exception as exc:
            logger.debug("Org lookup failed: %s", exc)

    if dev_tenant_enabled():
        return await _ensure_dev_org()
    return None


async def resolve_org_role(request: Request, org_id: uuid.UUID, user_id: str | None) -> str:
    """Resolve RBAC role for user within org."""
    _, jwt_role = extract_org_claims(request)
    if jwt_role:
        normalized = jwt_role.replace("org:", "").lower()
        if normalized in ("admin", "analyst", "viewer"):
            return normalized

    if dev_tenant_enabled() and user_id:
        return DEV_LOCAL_ORG_ROLE

    if not user_id:
        return "viewer"

    try:
        async with AsyncSessionLocal() as session:
            row = (
                await session.execute(
                    select(OrgMembership).where(
                        OrgMembership.org_id == org_id,
                        OrgMembership.user_id == user_id,
                        OrgMembership.status == "active",
                    )
                )
            ).scalar_one_or_none()
            if row:
                return row.role
    except Exception as exc:
        logger.debug("Membership lookup failed: %s", exc)
    return "viewer"


async def get_org_branding(org_id: uuid.UUID | None) -> dict:
    """Load branding JSONB for an organisation."""
    if not org_id or _db_skipped():
        if dev_tenant_enabled():
            return {
                "firm_name": "Sovereign-Alpha",
                "product_name": "Sovereign-Alpha",
                "primary_color": "#e5a00d",
            }
        return {}
    try:
        async with AsyncSessionLocal() as session:
            org = await session.get(Organisation, org_id)
            if org and org.branding:
                return org.branding
    except Exception as exc:
        logger.debug("Branding lookup failed: %s", exc)
    return {}


class TenantMiddleware(BaseHTTPMiddleware):
    """Attach org_id and org_role to request.state."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path in ("/metrics", "/health"):
            return await call_next(request)

        try:
            user_id = getattr(request.state, "user_id", None)
            org_id = await resolve_org_id(request)
            request.state.org_id = org_id
            if org_id and user_id:
                request.state.org_role = await resolve_org_role(request, org_id, user_id)
            elif dev_tenant_enabled():
                request.state.org_role = DEV_LOCAL_ORG_ROLE
            else:
                request.state.org_role = getattr(request.state, "org_role", None)

            branding = await get_org_branding(org_id)
            request.state.org_branding = branding
        except Exception as exc:
            logger.debug("Tenant context skipped: %s", exc)
            existing = getattr(request.state, "org_id", None)
            if isinstance(existing, str):
                existing = None
            request.state.org_id = existing or (
                DEV_LOCAL_ORG_UUID if dev_tenant_enabled() else None
            )
            request.state.org_role = DEV_LOCAL_ORG_ROLE if dev_tenant_enabled() else None
            request.state.org_branding = {}

        return await call_next(request)
