"""Batch ingest endpoint tests."""
import pytest
from unittest.mock import AsyncMock

from httpx import ASGITransport, AsyncClient

from main import app


@pytest.fixture
async def batch_client(monkeypatch):
    monkeypatch.setattr(
        "routers.ingest._ingest_one",
        AsyncMock(
            side_effect=lambda contents, filename, user_id: {
                "filename": filename,
                "file_size_kb": 1.0,
                "document_id": f"doc-{filename}",
                "extraction": {"ticker_guess": "TSLA", "thesis_points": []},
            }
        ),
    )
    monkeypatch.setattr(
        "routers.ingest.create_corpus",
        AsyncMock(return_value=type("C", (), {"id": "corpus-1"})()),
    )
    monkeypatch.setattr(
        "routers.ingest.synthesize_corpus_thesis",
        AsyncMock(return_value={"thesis_points": [], "ticker_guess": "TSLA"}),
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_batch_rejects_more_than_five(batch_client):
    files = [("files", (f"f{i}.pdf", b"%PDF", "application/pdf")) for i in range(6)]
    resp = await batch_client.post("/api/ingest/batch", files=files)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_batch_creates_corpus(batch_client):
    files = [
        ("files", ("a.pdf", b"%PDF-a", "application/pdf")),
        ("files", ("b.pdf", b"%PDF-b", "application/pdf")),
    ]
    resp = await batch_client.post("/api/ingest/batch", files=files, data={"ticker": "TSLA"})
    assert resp.status_code == 200
    data = resp.json()
    assert "corpus_id" in data
    assert len(data["document_ids"]) == 2
    assert "merged_extraction" in data
