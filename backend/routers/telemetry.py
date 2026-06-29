"""
WebSocket Telemetry Router
Streams real-time agent log events to the frontend telemetry panel.
Clients connect to ws://localhost:8000/ws/telemetry
"""
import asyncio
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# Global broadcast queue — agents push events here, WS sends to clients
# In production, use Redis pub/sub for multi-instance support
_telemetry_queue: asyncio.Queue = asyncio.Queue()
_connected_clients: list[WebSocket] = []
_connect_times: dict[WebSocket, float] = {}


async def broadcast_log(event: dict):
    """
    Push a log event to all connected WebSocket clients.
    Call this from the agent pipeline to stream real-time logs.
    
    event = {"agent": "FUNDAMENTAL", "message": "...", "ts": 0.2}
    """
    if "ts" not in event:
        event["ts"] = 0

    dead_clients = []
    for ws in _connected_clients:
        try:
            await ws.send_text(json.dumps(event))
        except Exception:
            dead_clients.append(ws)

    for ws in dead_clients:
        if ws in _connected_clients:
            _connected_clients.remove(ws)


@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for streaming agent telemetry logs.
    Connect from frontend: new WebSocket('ws://localhost:8000/ws/telemetry')
    """
    await websocket.accept()
    _connected_clients.append(websocket)
    _connect_times[websocket] = time.time()

    # Send welcome message (ts=0 — not elapsed seconds)
    await websocket.send_text(json.dumps({
        "agent": "SYSTEM",
        "message": "[SOVEREIGN-ALPHA] WebSocket telemetry stream connected.",
        "ts": 0,
    }))

    try:
        # Keep connection alive — ping every 30s
        while True:
            try:
                # Wait for client message (used as keepalive ping)
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
