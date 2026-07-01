"""Tests for workflow API endpoints."""
import uuid
from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_start_workflow_auto_approve(client, monkeypatch):
    wf_id = str(uuid.uuid4())
    mock_start = AsyncMock(
        return_value={
            "workflow_id": wf_id,
            "status": "completed",
            "pending_checkpoint": None,
            "analysis": {"ticker": "TSLA", "memo": {"rating": "BULLISH"}},
            "report_id": str(uuid.uuid4()),
        }
    )
    monkeypatch.setattr("services.workflow_service.start_due_diligence_workflow", mock_start)
    monkeypatch.setattr("routers.workflows.start_due_diligence_workflow", mock_start)

    resp = await client.post(
        "/api/workflows/due-diligence",
        json={"goal": "Full DD on TSLA", "auto_approve": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["workflow_id"] == wf_id
    assert data["status"] == "completed"


@pytest.mark.asyncio
async def test_workflow_hitl_pause(client, monkeypatch):
    wf_id = str(uuid.uuid4())
    mock_start = AsyncMock(
        return_value={
            "workflow_id": wf_id,
            "status": "awaiting_approval",
            "pending_checkpoint": {
                "step": "fetch_tools",
                "summary": "Will fetch SEC filings and web search results for grounding",
            },
        }
    )
    mock_resume = AsyncMock(return_value={"workflow_id": wf_id, "status": "running"})
    mock_get = AsyncMock(
        return_value={
            "workflow_id": wf_id,
            "status": "awaiting_approval",
            "pending_checkpoint": {
                "step": "fetch_tools",
                "summary": "Will fetch SEC filings and web search results for grounding",
            },
        }
    )
    monkeypatch.setattr("services.workflow_service.start_due_diligence_workflow", mock_start)
    monkeypatch.setattr("routers.workflows.start_due_diligence_workflow", mock_start)
    monkeypatch.setattr("services.workflow_service.resume_workflow", mock_resume)
    monkeypatch.setattr("routers.workflows.resume_workflow", mock_resume)
    monkeypatch.setattr("services.workflow_service.get_workflow_status", mock_get)
    monkeypatch.setattr("routers.workflows.get_workflow_status", mock_get)

    resp = await client.post(
        "/api/workflows/due-diligence",
        json={"goal": "Do full due diligence on TSLA", "auto_approve": False},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "awaiting_approval"
    assert data["pending_checkpoint"]["step"] == "fetch_tools"

    approve = await client.post(
        f"/api/workflows/{wf_id}/approve",
        json={"checkpoint": "fetch_tools", "approved": True},
    )
    assert approve.status_code == 200


@pytest.mark.asyncio
async def test_get_workflow_not_found(client, monkeypatch):
    monkeypatch.setattr("routers.workflows.get_workflow_status", AsyncMock(return_value=None))
    resp = await client.get("/api/workflows/00000000-0000-0000-0000-000000000001")
    assert resp.status_code == 404
