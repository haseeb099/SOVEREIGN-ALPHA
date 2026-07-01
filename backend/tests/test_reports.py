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
    mock_row.password_hash = None
    mock_row.template = "equity_research"

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


@pytest.mark.asyncio
async def test_generate_report_with_template_and_password(client, monkeypatch):
    mock_row = MagicMock()
    mock_row.id = uuid.uuid4()
    mock_row.share_token = "gen-token"
    mock_row.version = 1
    mock_row.template = "due_diligence"

    mock_session = MagicMock()
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock(side_effect=lambda r: None)

    class FakeCtx:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, *a):
            pass

    monkeypatch.setattr("routers.reports.AsyncSessionLocal", lambda: FakeCtx())
    monkeypatch.setattr(
        "routers.reports.polish_report_narrative",
        AsyncMock(return_value={"summary": "Polished", "bull_verdict": "B", "bear_verdict": "R"}),
    )

    resp = await client.post(
        "/api/reports/generate",
        json={
            "ticker": "TSLA",
            "analysis": SAMPLE_PAYLOAD,
            "template": "due_diligence",
            "password": "secret",
            "expires_in_days": 7,
            "polish": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["template"] == "due_diligence"
    assert data["password_protected"] is True
    assert "share_token" in data
