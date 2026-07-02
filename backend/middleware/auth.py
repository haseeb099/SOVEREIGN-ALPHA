"""Clerk JWT verification — graceful skip when CLERK_SECRET_KEY is unset."""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

CLERK_SECRET_KEY = os.environ.get("CLERK_SECRET_KEY", "")
CLERK_JWKS_URL = os.environ.get("CLERK_JWKS_URL", "")
CLERK_ISSUER = os.environ.get("CLERK_ISSUER", "")
DEV_LOCAL_USER = "dev-local-user"
DEV_LOCAL_ORG = "dev-local-org"
DEV_LOCAL_ORG_ID = "dev-local-org"


def dev_auth_enabled() -> bool:
    """Local dev without Clerk — attach a stable demo user so CRUD routes work."""
    return (
        os.environ.get("ENVIRONMENT", "development") == "development"
        and not os.environ.get("CLERK_SECRET_KEY", "")
    )

_jwks_cache: dict | None = None


def _resolve_jwks_url() -> str:
    if CLERK_JWKS_URL:
        return CLERK_JWKS_URL
    if CLERK_ISSUER:
        return f"{CLERK_ISSUER.rstrip('/')}/.well-known/jwks.json"
    return ""


async def _fetch_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    jwks_url = _resolve_jwks_url()
    if not jwks_url:
        return {"keys": []}
    headers = {}
    if CLERK_SECRET_KEY:
        headers["Authorization"] = f"Bearer {CLERK_SECRET_KEY}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(jwks_url, headers=headers)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache


def _decode_clerk_token(token: str) -> Optional[dict]:
    """Verify JWT with PyJWT when Clerk is configured."""
    try:
        import jwt
        from jwt import PyJWKClient

        jwks_url = _resolve_jwks_url()
        if CLERK_SECRET_KEY and jwks_url:
            jwk_client = PyJWKClient(jwks_url)
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            decode_opts: dict = {"verify_aud": False}
            issuer = CLERK_ISSUER or None
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=issuer,
                options=decode_opts,
            )
        if not CLERK_SECRET_KEY:
            return jwt.decode(token, options={"verify_signature": False})
        logger.warning("CLERK_SECRET_KEY set but CLERK_JWKS_URL/CLERK_ISSUER missing")
        return None
    except ImportError:
        logger.debug("PyJWT not installed — auth decode skipped")
        return None
    except Exception as exc:
        logger.debug("JWT verification failed: %s", exc)
        return None


def extract_token_payload(request: Request) -> Optional[dict]:
    """Extract decoded JWT payload from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    return _decode_clerk_token(token)


def extract_org_context(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Extract org_id and org_role from Clerk JWT claims."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, None
    token = auth[7:]
    payload = _decode_clerk_token(token)
    if not payload:
        return None, None
    org_id = payload.get("org_id")
    org_role = payload.get("org_role")
    org_claim = payload.get("o")
    if isinstance(org_claim, dict):
        org_id = org_id or org_claim.get("id")
        org_role = org_role or org_claim.get("rol")
    if org_role and ":" in str(org_role):
        org_role = str(org_role).split(":")[-1]
    return org_id, (org_role.lower() if org_role else None)


def extract_user_id(request: Request) -> Optional[str]:
    """Extract Clerk user id (sub) from Authorization header."""
    payload = extract_token_payload(request)
    if payload:
        return payload.get("sub")
    return None


def extract_org_claims_from_payload(payload: dict | None) -> tuple[Optional[str], Optional[str]]:
    """Extract Clerk org_id and org_role from JWT payload."""
    if not payload:
        return None, None
    org_id = payload.get("org_id")
    org_role = payload.get("org_role")
    nested = payload.get("o")
    if isinstance(nested, dict):
        org_id = org_id or nested.get("id")
        org_role = org_role or nested.get("rol")
    return org_id, org_role


class AuthMiddleware(BaseHTTPMiddleware):
    """Attach user_id to request.state; does not block unauthenticated requests."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        payload = extract_token_payload(request)
        request.state.user_id = payload.get("sub") if payload else None
        clerk_org_id, org_role = extract_org_claims_from_payload(payload)
        request.state.clerk_org_id = clerk_org_id
        request.state.org_role = org_role
        if not request.state.user_id and dev_auth_enabled():
            request.state.user_id = DEV_LOCAL_USER
            request.state.org_role = "admin"
        return await call_next(request)


def resolve_user_id(request: Request) -> Optional[str]:
    """Resolve authenticated user id from request state or Authorization header."""
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return user_id
    return extract_user_id(request)


def require_auth(request: Request) -> str:
    """Dependency helper — raises 401 if no authenticated user."""
    user_id = resolve_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id
