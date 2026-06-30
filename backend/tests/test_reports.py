"""Report PDF and email endpoint tests."""
import sys
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


SAMPLE_PAYLOAD = {
    "ticker": "TSLA",
    "memo": {
        "summary": "Test summary",
        "rating": "BULLISH",
        "price_target": 220,
        "confidence_score": 7,
        "bull_verdict": "Bull",
        "bear_verdict": "Bear",
        "distribution": {
            "bear": {"price": 150, "probability": 0.2},
            "base": {"price": 200, "probability": 0.5},
            "bull": {"price": 280, "probability": 0.3},
        },
        "audit_warnings": [],
    },
    "thesis_points": [],
    "sovereign_score": 72,
}


@pytest.mark.asyncio
async def test_report_pdf_content_type(client, monkeypatch):
    token = "test-share-token"
    mock_row = MagicMock()
    mock_row.share_token = token
    mock_row.ticker = "TSLA"
    mock_row.payload = SAMPLE_PAYLOAD
    mock_row.expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=mock_row)

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    class FakeSessionCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("routers.reports.AsyncSessionLocal", lambda: FakeSessionCtx())

    mock_weasyprint = MagicMock()
    mock_weasyprint.HTML.return_value.write_pdf.return_value = b"%PDF-1.4 fake"

    with patch.dict(sys.modules, {"weasyprint": mock_weasyprint}):
        resp = await client.get(f"/api/reports/{token}/pdf")

    assert resp.status_code == 200
    assert "pdf" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_send_report_deferred_without_resend(client, monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    resp = await client.post(
        f"/api/reports/{uuid.uuid4()}/send",
        json={"to": "user@example.com"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "deferred"
