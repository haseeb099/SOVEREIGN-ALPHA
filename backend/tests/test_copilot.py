"""Integration tests for /api/copilot SSE streaming."""
import json
from unittest.mock import AsyncMock, MagicMock

import pytest


class FakeDelta:
    def __init__(self, content):
        self.content = content


class FakeChunk:
    def __init__(self, content):
        self.choices = [MagicMock(delta=FakeDelta(content))]


class FakeStream:
    def __init__(self, tokens):
        self._tokens = tokens

    def __aiter__(self):
        self._iter = iter(self._tokens)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


@pytest.mark.asyncio
async def test_copilot_sse_stream_format(client, monkeypatch):
    class FakeAsyncCerebras:
        def __init__(self, api_key=None):
            self.chat = MagicMock()

        async def create_stream(self, **_kwargs):
            return FakeStream(
                [
                    FakeChunk("Based on "),
                    FakeChunk("your portfolio"),
                    FakeChunk(""),
                ]
            )

    fake_client = FakeAsyncCerebras()

    async def fake_create(**kwargs):
        return FakeStream(
            [
                FakeChunk("Based on "),
                FakeChunk("your portfolio"),
                FakeChunk(""),
            ]
        )

    fake_client.chat.completions.create = fake_create

    monkeypatch.setattr("routers.copilot.CEREBRAS_API_KEY", "mock-key")
    monkeypatch.setattr("routers.copilot.AsyncCerebras", lambda api_key=None: fake_client)

    async with client.stream(
        "POST",
        "/api/copilot",
        json={"query": "What is my rate exposure?", "portfolio_context": {"ticker": "TSLA"}},
    ) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        body = ""
        async for chunk in resp.aiter_text():
            body += chunk

    assert "data: " in body
    assert "[DONE]" in body
    assert "Based on" in body
    assert "your portfolio" in body


@pytest.mark.asyncio
async def test_copilot_empty_query_returns_400(client, monkeypatch):
    monkeypatch.setattr("routers.copilot.CEREBRAS_API_KEY", "mock-key")

    resp = await client.post("/api/copilot", json={"query": "   "})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_copilot_missing_api_key_returns_503(client, monkeypatch):
    monkeypatch.setattr("routers.copilot.CEREBRAS_API_KEY", "")

    resp = await client.post("/api/copilot", json={"query": "Hello"})
    assert resp.status_code == 503
