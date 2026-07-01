"""Unit tests for ingest_service."""
import json

import pytest

from services.ingest_service import _extract_pdf_text, extract_thesis_from_document


LONG_MEMO = (
    "Tesla Inc. investment thesis memo. " * 20
    + "Operating margins are expected to remain above 18% through FY2025. "
    + "Revenue growth should exceed 20% annually. "
)


@pytest.mark.asyncio
async def test_extract_thesis_from_txt(mock_cerebras_client, monkeypatch):
    monkeypatch.setattr("services.ingest_service.CEREBRAS_API_KEY", "mock-key")

    result = await extract_thesis_from_document(LONG_MEMO.encode("utf-8"), "memo.txt")

    assert result["ticker_guess"] == "TSLA"
    assert len(result["thesis_points"]) >= 1
    assert result["thesis_points"][0]["status"] == "PENDING"
    assert result["thesis_points"][0]["current_value"] == "Awaiting live data"


@pytest.mark.asyncio
async def test_short_document_raises_value_error(mock_cerebras_client, monkeypatch):
    monkeypatch.setattr("services.ingest_service.CEREBRAS_API_KEY", "mock-key")

    with pytest.raises(ValueError, match="Could not extract meaningful text"):
        await extract_thesis_from_document(b"too short", "memo.txt")


@pytest.mark.asyncio
async def test_missing_api_key_raises_runtime_error(monkeypatch):
    monkeypatch.setattr("services.ingest_service.CEREBRAS_API_KEY", "")

    with pytest.raises(RuntimeError, match="CEREBRAS_API_KEY not set"):
        await extract_thesis_from_document(LONG_MEMO.encode("utf-8"), "memo.txt")


def test_extract_pdf_text_with_mocked_fitz(monkeypatch):
    class FakePage:
        def get_text(self):
            return "Page one text about margins and growth assumptions."

    class FakeDoc:
        def __iter__(self):
            return iter([FakePage(), FakePage()])

        def close(self):
            return None

    def fake_open(*_args, **_kwargs):
        return FakeDoc()

    fake_fitz = type("fitz", (), {"open": fake_open})()
    monkeypatch.setitem(__import__("sys").modules, "fitz", fake_fitz)

    text, page_map = _extract_pdf_text(b"%PDF-fake")
    assert "Page one text" in text
    assert "margins" in text
    assert page_map


@pytest.mark.asyncio
async def test_json_document_passthrough(mock_cerebras_client, monkeypatch):
    monkeypatch.setattr("services.ingest_service.CEREBRAS_API_KEY", "mock-key")
    payload = {"thesis": "x" * 120}
    result = await extract_thesis_from_document(
        json.dumps(payload).encode("utf-8"),
        "data.json",
    )
    assert "thesis_points" in result


@pytest.mark.asyncio
async def test_null_target_price_stripped(monkeypatch):
    """LLM may return target_price: null — must not break ingest."""
    monkeypatch.setattr("services.ingest_service.CEREBRAS_API_KEY", "mock-key")

    class FakeMessage:
        content = json.dumps(
            {
                "ticker_guess": "TSLA",
                "thesis_points": [
                    {"id": 1, "text": "Margins above 18%", "metric": "Margins"},
                ],
                "target_price": None,
                "rating": None,
            }
        )

    class FakeChoice:
        message = FakeMessage()

    class FakeCompletion:
        choices = [FakeChoice()]

    class FakeCerebras:
        def __init__(self, api_key=None):
            self.chat = type("Chat", (), {})()
            self.chat.completions = type("Completions", (), {})()
            self.chat.completions.create = lambda **_kwargs: FakeCompletion()

    monkeypatch.setattr("services.chunked_extraction_service.Cerebras", FakeCerebras)

    async def fake_to_thread(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    monkeypatch.setattr("services.chunked_extraction_service.asyncio.to_thread", fake_to_thread)

    result = await extract_thesis_from_document(LONG_MEMO.encode("utf-8"), "memo.txt")
    assert "target_price" not in result
    assert "rating" not in result
    assert result["ticker_guess"] == "TSLA"


@pytest.mark.asyncio
async def test_long_document_uses_chunked_extraction(monkeypatch):
    """Text beyond 4000 chars should use chunked extraction path."""
    monkeypatch.setattr("services.ingest_service.CEREBRAS_API_KEY", "mock-key")
    long_text = (
        "Tesla Inc. annual report section. " * 500
        + "UNIQUE_MARKER_BEYOND_4000 operating margins above 22% by FY2026."
    )
    assert len(long_text) > 12000

    async def fake_chunked(text, page_map=None):
        assert len(text) > 4000
        assert "UNIQUE_MARKER_BEYOND_4000" in text
        return {
            "ticker_guess": "TSLA",
            "thesis_points": [
                {
                    "id": 1,
                    "text": "Operating margins above 22% by FY2026",
                    "metric": "Margins",
                    "threshold": "22%",
                }
            ],
            "extraction_mode": "chunked",
            "chunks_processed": 4,
        }

    monkeypatch.setattr("services.ingest_service.extract_thesis_chunked", fake_chunked)
    result = await extract_thesis_from_document(long_text.encode("utf-8"), "10k.txt")
    assert result["extraction_mode"] == "chunked"
    assert result["chunks_processed"] == 4
    assert "22%" in result["thesis_points"][0]["text"]
