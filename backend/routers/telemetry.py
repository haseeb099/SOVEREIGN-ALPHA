"""
WebSocket Telemetry Router with Redis pub/sub for multi-instance support.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
TELEMETRY_CHANNEL = "sovereign:telemetry"

_connected_clients: list[WebSocket] = []
_connect_times: dict[WebSocket, float] = {}
_redis_listener_task: asyncio.Task | None = None
_redis_client: Any = None
_redis_lock = asyncio.Lock()


async def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    async with _redis_lock:
        if _redis_client is not None:
            return _redis_client
        import redis.asyncio as redis

        _redis_client = await redis.from_url(REDIS_URL, decode_responses=True)
        return _redis_client


async def _publish_redis(event: dict) -> None:
    try:
        r = await _get_redis()
        await r.publish(TELEMETRY_CHANNEL, json.dumps(event))
    except Exception as exc:
        logger.debug("Redis telemetry publish failed: %s", exc)


async def _redis_subscriber() -> None:
    try:
        import redis.asyncio as redis

        r = await redis.from_url(REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(TELEMETRY_CHANNEL)
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                event = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                continue
            await _local_broadcast(event)
    except Exception as exc:
        logger.warning("Redis telemetry subscriber stopped: %s", exc)


async def _local_broadcast(event: dict) -> None:
    if "ts" not in event:
        event["ts"] = 0
    dead: list[WebSocket] = []
    for ws in _connected_clients:
        try:
            await ws.send_text(json.dumps(event))
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _connected_clients:
            _connected_clients.remove(ws)


async def broadcast_log(event: dict, workflow_id: str | None = None) -> None:
    """Push log event to local WebSocket clients and Redis pub/sub peers."""
    if workflow_id and "workflow_id" not in event:
        event = {**event, "workflow_id": workflow_id}
    await _local_broadcast(event)
    await _publish_redis(event)


def start_redis_listener() -> None:
    global _redis_listener_task
    if _redis_listener_task is None or _redis_listener_task.done():
        _redis_listener_task = asyncio.create_task(_redis_subscriber())


@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket):
    await websocket.accept()
    _connected_clients.append(websocket)
    _connect_times[websocket] = time.time()
    start_redis_listener()

    await websocket.send_text(json.dumps({
        "agent": "SYSTEM",
        "message": "[SOVEREIGN-ALPHA] WebSocket telemetry stream connected.",
        "ts": 0,
    }))

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == "ping":
                    elapsed = round(time.time() - _connect_times.get(websocket, time.time()), 2)
                    await websocket.send_text(json.dumps({
                        "agent": "SYSTEM",
                        "message": "pong",
                        "ts": elapsed,
                    }))
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({
                    "agent": "HEARTBEAT",
                    "message": "alive",
                    "ts": 0,
                }))
    except WebSocketDisconnect:
        if websocket in _connected_clients:
            _connected_clients.remove(websocket)
        _connect_times.pop(websocket, None)
