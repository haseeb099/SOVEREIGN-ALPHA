"""Integration tests for /api/ingest."""
from unittest.mock import AsyncMock

import pytest

LONG_MEMO = (
    "Tesla Inc. institutional research memo with detailed assumptions. " * 15
)


@pytest.mark.asyncio
async def test_ingest_txt_returns_thesis_points(
    client,
    mock_persistence,
    monkeypatch,
):
    fake_extraction = {
        "ticker_guess": "TSLA",
        "thesis_points": [{"id": 1, "text": "Margins above 18%", "metric": "Margins"}],
        "rating": "BUY",
    }
    monkeypatch.setattr(
        "routers.ingest.extract_thesis_from_document",
        AsyncMock(return_value=fake_extraction),
    )

    resp = await client.post(
        "/api/ingest",
        files={"file": ("memo.txt", LONG_MEMO.encode("utf-8"), "text/plain")},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "memo.txt"
    assert data["extraction"]["ticker_guess"] == "TSLA"
    assert len(data["extraction"]["thesis_points"]) == 1


@pytest.mark.asyncio
async def test_ingest_rejects_unsupported_file_type(client):
    resp = await client.post(
        "/api/ingest",
        files={"file": ("image.png", b"fake", "image/png")},
    )
    assert resp.status_code == 400
    assert "Unsupported file type" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_ingest_rejects_oversized_file(client):
    oversized = b"x" * (10 * 1024 * 1024 + 1)
    resp = await client.post(
        "/api/ingest",
        files={"file": ("big.txt", oversized, "text/plain")},
    )
    assert resp.status_code == 413
    assert "too large" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_ingest_extraction_error_returns_422(client, monkeypatch):
    monkeypatch.setattr(
        "routers.ingest.extract_thesis_from_document",
        AsyncMock(side_effect=ValueError("Could not extract meaningful text")),
    )

    resp = await client.post(
        "/api/ingest",
        files={"file": ("empty.txt", b"short", "text/plain")},
    )

    assert resp.status_code == 422
