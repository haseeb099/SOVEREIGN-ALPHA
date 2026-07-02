"""Permission enforcement helpers for FastAPI dependencies."""
from __future__ import annotations

import uuid

from fastapi import HTTPException, Request

from middleware.auth import require_auth
from middleware.rbac import role_has_permission


def get_org_id(request: Request) -> uuid.UUID | None:
    return getattr(request.state, "org_id", None)


def get_org_role(request: Request) -> str | None:
    return getattr(request.state, "org_role", None)


def require_permission(request: Request, permission: str) -> str:
    """Raise 403 if the current org role lacks the permission. Returns user_id."""
    user_id = require_auth(request)
    role = get_org_role(request)
    if not role_has_permission(role, permission):
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: {permission} requires elevated role (current: {role or 'none'})",
        )
    return user_id


def require_org_context(request: Request) -> tuple[str, uuid.UUID]:
    """Require authenticated user with resolved org context."""
    user_id = require_auth(request)
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    return user_id, org_id
