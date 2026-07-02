"""Role-based access control permission map."""
from __future__ import annotations

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {
        "org:read",
        "org:write",
        "org:settings",
        "members:read",
        "members:write",
        "api_keys:read",
        "api_keys:write",
        "thesis:read",
        "thesis:write",
        "analyze:run",
        "ingest:write",
        "workspace:read",
        "workspace:write",
        "approval:read",
        "approval:write",
        "audit:read",
        "audit:export",
        "portfolio:read",
        "portfolio:write",
    },
    "analyst": {
        "org:read",
        "thesis:read",
        "thesis:write",
        "analyze:run",
        "ingest:write",
        "workspace:read",
        "workspace:write",
        "approval:read",
        "approval:write",
        "portfolio:read",
        "portfolio:write",
    },
    "viewer": {
        "org:read",
        "thesis:read",
        "workspace:read",
        "approval:read",
        "portfolio:read",
    },
}


def role_has_permission(role: str | None, permission: str) -> bool:
    if not role:
        return False
    perms = ROLE_PERMISSIONS.get(role.lower(), set())
    return permission in perms


def is_read_only_role(role: str | None) -> bool:
    return (role or "").lower() == "viewer"
