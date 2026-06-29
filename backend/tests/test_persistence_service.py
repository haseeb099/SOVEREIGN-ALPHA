"""Unit tests for persistence_service with mocked database sessions."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.persistence_service import get_analysis_history, save_analysis, save_ingestion


@pytest.mark.asyncio
async def test_save_analysis_persists_rows(monkeypatch):
    mock_session = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_session_local = MagicMock(return_value=mock_session)
    monkeypatch.setattr("services.persistence_service.AsyncSessionLocal", mock_session_local)

    result = await save_analysis(
        "TSLA",
        {"margins": 18.5},
        {"memo": {"rating": "BULLISH"}, "thesis_points": []},
    )

    assert result is not None
    assert mock_session.add.call_count == 2
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_save_analysis_handles_db_errors(monkeypatch):
    mock_session = MagicMock()
    mock_session.commit = AsyncMock(side_effect=RuntimeError("DB down"))
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(
        "services.persistence_service.AsyncSessionLocal",
        MagicMock(return_value=mock_session),
    )

    result = await save_analysis("TSLA", {}, {})
    assert result is None


@pytest.mark.asyncio
async def test_save_ingestion_persists_row(monkeypatch):
    mock_session = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(
        "services.persistence_service.AsyncSessionLocal",
        MagicMock(return_value=mock_session),
    )

    result = await save_ingestion("memo.pdf", 12.5, {"thesis_points": []})
    assert result is not None
    mock_session.add.assert_called_once()
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_analysis_history_returns_rows(monkeypatch):
    from datetime import datetime, timezone

    row = MagicMock()
    row.id = "uuid-1"
    row.ticker = "TSLA"
    row.scenario = {"margins": 18.5}
    row.result = {
        "memo": {"rating": "BULLISH"},
        "thesis_points": [{"id": 1}],
        "pipeline_elapsed_seconds": 2.1,
    }
    row.created_at = datetime(2026, 6, 29, tzinfo=timezone.utc)

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [row]

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_session.execute = AsyncMock(return_value=mock_result)

    monkeypatch.setattr(
        "services.persistence_service.AsyncSessionLocal",
        MagicMock(return_value=mock_session),
    )

    history = await get_analysis_history("TSLA")
    assert len(history) == 1
    assert history[0]["ticker"] == "TSLA"
    assert history[0]["memo"]["rating"] == "BULLISH"
