"""Health check subsystem probes."""
from __future__ import annotations

import asyncio
import os
import time
from typing import Any

from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL

from services.market_service import get_last_market_fetch_at
from services.massive_flatfiles_service import (
    MASSIVE_S3_BUCKET,
    MASSIVE_S3_ENDPOINT,
    flatfiles_configured,
)
from services.polygon_service import get_last_polygon_fetch_at, polygon_available


async def check_database() -> dict[str, Any]:
    try:
        from database import engine
        from sqlalchemy import text

        async def _probe() -> None:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))

        await asyncio.wait_for(_probe(), timeout=3)
        return {"status": "ok"}
    except asyncio.TimeoutError:
        return {"status": "error", "detail": "database connection timed out"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


async def check_redis() -> dict[str, Any]:
    try:
        import redis.asyncio as redis

        url = os.environ.get("REDIS_URL", "redis://localhost:6379")

        async def _probe() -> None:
            r = await redis.from_url(url, decode_responses=True, socket_connect_timeout=3)
            await r.ping()
            await r.aclose()

        await asyncio.wait_for(_probe(), timeout=3)
        return {"status": "ok"}
    except asyncio.TimeoutError:
        return {"status": "error", "detail": "redis connection timed out"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


async def check_polygon() -> dict[str, Any]:
    if not os.environ.get("POLYGON_API_KEY"):
        return {"status": "unconfigured", "detail": "POLYGON_API_KEY not set"}
    ok = await polygon_available()
    last_fetch = get_last_polygon_fetch_at() or get_last_market_fetch_at()
    return {
        "status": "ok" if ok else "degraded",
        "last_fetch_at": last_fetch,
        "configured": True,
    }


def check_cerebras() -> dict[str, Any]:
    if not CEREBRAS_API_KEY:
        return {"status": "error", "detail": "CEREBRAS_API_KEY not set"}
    return {"status": "ok", "model": CEREBRAS_MODEL}


def check_newsapi() -> dict[str, Any]:
    key = os.environ.get("NEWS_API_KEY", "")
    if not key:
        return {"status": "unconfigured"}
    return {"status": "ok"}


async def check_massive_flatfiles_status() -> dict[str, Any]:
    """Lightweight probe for /health — deep S3 check is on /api/market/flatfiles/status."""
    if not flatfiles_configured():
        return {"status": "unconfigured", "detail": "MASSIVE_S3 credentials not set"}
    return {
        "status": "configured",
        "bucket": MASSIVE_S3_BUCKET,
        "endpoint": MASSIVE_S3_ENDPOINT,
        "detail": "Use GET /api/market/flatfiles/status for live S3 probe",
    }


async def build_health_payload() -> dict[str, Any]:
    db = await check_database()
    redis_status = await check_redis()
    polygon = await check_polygon()
    massive_flatfiles = await check_massive_flatfiles_status()
    cerebras = check_cerebras()
    news = check_newsapi()
    last_market = get_last_market_fetch_at() or get_last_polygon_fetch_at()

    subsystems = {
        "database": db,
        "redis": redis_status,
        "polygon": polygon,
        "massive_flatfiles": massive_flatfiles,
        "cerebras": cerebras,
        "newsapi": news,
        "last_market_fetch_at": last_market,
    }

    degraded_reasons: list[str] = []
    if db["status"] != "ok":
        degraded_reasons.append("database")
    if redis_status["status"] != "ok":
        degraded_reasons.append("redis")
    if polygon.get("status") == "degraded":
        degraded_reasons.append("polygon")
    if polygon.get("status") == "error":
        degraded_reasons.append("polygon")
    if cerebras["status"] != "ok":
        degraded_reasons.append("cerebras")

    warnings: list[str] = []
    if cerebras["status"] != "ok":
        warnings.append("CEREBRAS_API_KEY not set — analyze and copilot endpoints will return 503")

    overall = "online"
    if cerebras["status"] != "ok":
        overall = "offline"
    elif degraded_reasons:
        overall = "degraded"

    return {
        "status": overall,
        "model": CEREBRAS_MODEL,
        "provider": "cerebras",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "subsystems": subsystems,
        "degraded_reason": ", ".join(degraded_reasons) if degraded_reasons else None,
        "warnings": warnings if warnings else None,
    }
