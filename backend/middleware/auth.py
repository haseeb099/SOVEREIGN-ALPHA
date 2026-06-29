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


def extract_user_id(request: Request) -> Optional[str]:
    """Extract Clerk user id (sub) from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    payload = _decode_clerk_token(token)
    if payload:
        return payload.get("sub")
    return None


class AuthMiddleware(BaseHTTPMiddleware):
    """Attach user_id to request.state; does not block unauthenticated requests."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        request.state.user_id = extract_user_id(request)
        return await call_next(request)


def require_auth(request: Request) -> str:
    """Dependency helper — raises 401 if no authenticated user."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id
