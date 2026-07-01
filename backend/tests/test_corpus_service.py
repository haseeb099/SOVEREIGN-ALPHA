"""Corpus service tests."""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from services import corpus_service


@pytest.mark.asyncio
async def test_create_corpus_validates_count(monkeypatch):
    with pytest.raises(ValueError, match="1–5"):
        await corpus_service.create_corpus("user-1", "TSLA", "Bundle", [])


@pytest.mark.asyncio
async def test_synthesize_merges_two_docs(monkeypatch):
    doc1_id = uuid.uuid4()
    doc2_id = uuid.uuid4()
    corpus_id = uuid.uuid4()

    class FakeCorpus:
        id = corpus_id
        document_ids = [str(doc1_id), str(doc2_id)]
        ticker = "TSLA"
        merged_extraction = None

    class FakeDoc:
        def __init__(self, id_, filename):
            self.id = id_
            self.filename = filename
            self.ticker_guess = "TSLA"
            self.extraction = {
                "thesis_points": [{"id": 1, "text": f"Thesis from {filename}", "metric": "Growth"}],
                "key_risks": ["Risk"],
            }

    fake_session = MagicMock()
    fake_session.get = AsyncMock(return_value=FakeCorpus())
    fake_result = MagicMock()
    fake_result.scalars.return_value.all.return_value = [
        FakeDoc(doc1_id, "memo1.pdf"),
        FakeDoc(doc2_id, "memo2.pdf"),
    ]
    fake_session.execute = AsyncMock(return_value=fake_result)
    fake_session.commit = AsyncMock()

    class FakeCtx:
        async def __aenter__(self):
            return fake_session

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr(corpus_service, "AsyncSessionLocal", lambda: FakeCtx())
    monkeypatch.setattr(corpus_service, "retrieve", AsyncMock(return_value=[]))
    monkeypatch.setattr(corpus_service, "CEREBRAS_API_KEY", "mock")

    def fake_sync(system, user):
        return {
            "thesis_points": [
                {"id": 1, "text": "Merged thesis A", "metric": "Growth"},
                {"id": 2, "text": "Merged thesis B", "metric": "Margins"},
            ],
            "key_risks": ["Risk"],
            "source_documents": [],
        }

    import asyncio

    async def fake_to_thread(fn, *args):
        return fake_sync(*args)

    monkeypatch.setattr(corpus_service.asyncio, "to_thread", fake_to_thread)

    result = await corpus_service.synthesize_corpus_thesis(str(corpus_id))
    assert len(result["thesis_points"]) == 2
