"""Tests for map-reduce chunked thesis extraction."""
import json

import pytest

from services.chunked_extraction_service import (
    CHUNK_SIZE,
    SINGLE_CALL_THRESHOLD,
    _split_text,
    extract_thesis_chunked,
    merge_thesis_extractions,
)


def test_split_text_overlap():
    text = "A" * 10000
    chunks = _split_text(text, chunk_size=4000, overlap=200)
    assert len(chunks) >= 3
    assert all(len(c) <= 4000 for c in chunks)


@pytest.mark.asyncio
async def test_short_doc_single_call(monkeypatch):
    monkeypatch.setattr("services.chunked_extraction_service.CEREBRAS_API_KEY", "mock")

    async def fake_thread(system, user, max_tokens=1200):
        return {
            "ticker_guess": "TSLA",
            "thesis_points": [{"id": 1, "text": "Margins above 18%", "metric": "Margins"}],
            "key_risks": [],
        }

    monkeypatch.setattr(
        "services.chunked_extraction_service.asyncio.to_thread",
        lambda fn, *args, **kwargs: fake_thread(*args, **kwargs),
    )

    text = "Tesla investment memo. " * 50
    assert len(text) < SINGLE_CALL_THRESHOLD
    result = await extract_thesis_chunked(text)
    assert result["extraction_mode"] == "single"
    assert result["chunks_processed"] == 1
    assert result["thesis_points"]


@pytest.mark.asyncio
async def test_long_doc_chunked_path(monkeypatch):
    monkeypatch.setattr("services.chunked_extraction_service.CEREBRAS_API_KEY", "mock")
    call_count = {"n": 0}

    async def fake_thread(system, user, max_tokens=1200):
        call_count["n"] += 1
        if "Merge these partial" in user:
            return {
                "ticker_guess": "TSLA",
                "thesis_points": [
                    {"id": 1, "text": "Content beyond char 4000", "metric": "Growth"},
                    {"id": 2, "text": "Margins above 18%", "metric": "Margins"},
                ],
                "key_risks": ["Competition"],
            }
        return {
            "thesis_points": [{"id": 1, "text": f"Point from chunk {call_count['n']}", "metric": "Growth"}],
            "key_risks": ["Risk A"],
        }

    monkeypatch.setattr(
        "services.chunked_extraction_service.asyncio.to_thread",
        lambda fn, *args, **kwargs: fake_thread(*args, **kwargs),
    )

    text = "X" * 20000
    result = await extract_thesis_chunked(text)
    assert result["extraction_mode"] == "chunked"
    assert result["chunks_processed"] > 1
    assert any("4000" in tp.get("text", "") or "Margins" in tp.get("text", "") for tp in result["thesis_points"])


@pytest.mark.asyncio
async def test_merge_dedupes_partials(monkeypatch):
    monkeypatch.setattr("services.chunked_extraction_service.CEREBRAS_API_KEY", "mock")

    async def fake_merge(system, user, max_tokens=1500):
        return {
            "thesis_points": [
                {"id": 1, "text": "Margins above 18%", "metric": "Margins", "threshold": "18%"},
            ],
            "key_risks": ["Competition"],
        }

    monkeypatch.setattr(
        "services.chunked_extraction_service.asyncio.to_thread",
        lambda fn, *args, **kwargs: fake_merge(*args, **kwargs),
    )

    partials = [
        {"thesis_points": [{"text": "Margins above 18%", "metric": "Margins", "threshold": "18%"}]},
        {"thesis_points": [{"text": "Margins remain above 18%", "metric": "Margins", "threshold": "18%"}]},
    ]
    merged = await merge_thesis_extractions(partials)
    assert len(merged["thesis_points"]) == 1


def test_single_partial_merge_passthrough():
    partial = {"thesis_points": [{"text": "A"}], "key_risks": []}
    import asyncio

    result = asyncio.get_event_loop().run_until_complete(merge_thesis_extractions([partial]))
    assert result == partial
