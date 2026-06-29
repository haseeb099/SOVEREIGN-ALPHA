"""Integration tests for WebSocket telemetry."""
import json

import pytest
from starlette.testclient import TestClient

from main import app


@pytest.fixture
def ws_client():
    with TestClient(app) as client:
        yield client


def test_websocket_connects_and_receives_welcome(ws_client):
    with ws_client.websocket_connect("/ws/telemetry") as ws:
        payload = json.loads(ws.receive_text())
        assert payload["agent"] == "SYSTEM"
        assert "connected" in payload["message"].lower()


def test_websocket_ping_pong(ws_client):
    with ws_client.websocket_connect("/ws/telemetry") as ws:
        ws.receive_text()  # welcome
        ws.send_text("ping")
        payload = json.loads(ws.receive_text())
        assert payload["message"] == "pong"
