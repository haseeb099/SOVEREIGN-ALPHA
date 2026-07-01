"""Redis-backed workflow checkpoint persistence."""
from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CHECKPOINT_TTL = int(os.environ.get("WORKFLOW_CHECKPOINT_TTL_SECONDS", "3600"))


def _checkpoint_key(workflow_id: str) -> str:
    return f"workflow:checkpoint:{workflow_id}"


async def _get_redis():
    import redis.asyncio as redis

    return await redis.from_url(REDIS_URL, decode_responses=True)


async def save_checkpoint(workflow_id: str, data: dict[str, Any]) -> None:
    try:
        r = await _get_redis()
        await r.setex(_checkpoint_key(workflow_id), CHECKPOINT_TTL, json.dumps(data))
    except Exception as e:
        logger.debug("Redis checkpoint save failed: %s", e)


async def load_checkpoint(workflow_id: str) -> dict[str, Any] | None:
    try:
        r = await _get_redis()
        raw = await r.get(_checkpoint_key(workflow_id))
        if raw:
            return json.loads(raw)
    except Exception as e:
        logger.debug("Redis checkpoint load failed: %s", e)
    return None


async def delete_checkpoint(workflow_id: str) -> None:
    try:
        r = await _get_redis()
        await r.delete(_checkpoint_key(workflow_id))
    except Exception as e:
        logger.debug("Redis checkpoint delete failed: %s", e)
