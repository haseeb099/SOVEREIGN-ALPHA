"""Report version chain and diff tests."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.report_diff_service import diff_reports


SAMPLE_A = {
    "memo": {"rating": "BULLISH", "price_target": 200, "summary": "Old summary text", "audit_warnings": ["A"]},
    "thesis_points": [{"metric": "Margins", "threshold": "18%", "text": "Margins stable"}],
}

SAMPLE_B = {
    "memo": {"rating": "NEUTRAL", "price_target": 210, "summary": "New summary text here", "audit_warnings": ["A", "B"]},
    "thesis_points": [
        {"metric": "Margins", "threshold": "18%", "text": "Margins improving"},
        {"metric": "Growth", "threshold": "20%", "text": "Revenue accelerating"},
    ],
}


def test_diff_output_shape():
    result = diff_reports(SAMPLE_A, SAMPLE_B)
    assert result["rating_change"] == {"from": "BULLISH", "to": "NEUTRAL"}
    assert result["price_target_delta"]["delta"] == 10
    assert len(result["thesis_points"]["added"]) == 2
    assert len(result["thesis_points"]["changed"]) == 0
    assert "B" in result["audit_warnings"]["added"]


@pytest.mark.asyncio
async def test_report_diff_endpoint(client, monkeypatch):
    fid, tid = uuid.uuid4(), uuid.uuid4()
    row_a = MagicMock()
    row_a.payload = SAMPLE_A
    row_a.user_id = "dev-local-user"
    row_b = MagicMock()
    row_b.payload = SAMPLE_B
    row_b.user_id = "dev-local-user"

    mock_session = MagicMock()
    mock_session.get = AsyncMock(side_effect=lambda model, id_: row_a if id_ == fid else row_b)

    class FakeCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr("routers.reports.AsyncSessionLocal", lambda: FakeCtx())

    resp = await client.get(f"/api/reports/diff?from_id={fid}&to_id={tid}")
    assert resp.status_code == 200
    data = resp.json()
    assert "diff" in data
    assert data["diff"]["rating_change"]["to"] == "NEUTRAL"
