"""Due-diligence workflow API — LangGraph HITL orchestrator."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from middleware.auth import resolve_user_id
from services.workflow_service import (
    get_workflow_status,
    resume_workflow,
    start_due_diligence_workflow,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class ScenarioInput(BaseModel):
    margins: float = Field(18.5, ge=5, le=35)
    rates: float = Field(4.5, ge=0, le=10)
    regulatory: str = Field("Low")
    sentiment: str = Field("Neutral")


class DueDiligenceRequest(BaseModel):
    goal: str = Field(..., min_length=3, max_length=2000)
    scenario: ScenarioInput | None = None
    auto_approve: bool = False


class ApproveRequest(BaseModel):
    checkpoint: str
    approved: bool = True


@router.post("/workflows/due-diligence")
async def start_due_diligence(body: DueDiligenceRequest, request: Request):
    user_id = resolve_user_id(request)
    scenario = body.scenario.model_dump() if body.scenario else {}
    return await start_due_diligence_workflow(
        body.goal,
        scenario,
        user_id=user_id,
        auto_approve=body.auto_approve,
    )


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str):
    status = await get_workflow_status(workflow_id)
    if not status:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return status


@router.post("/workflows/{workflow_id}/approve")
async def approve_workflow_checkpoint(workflow_id: str, body: ApproveRequest):
    current = await get_workflow_status(workflow_id)
    if not current:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if current.get("status") in ("completed", "failed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Workflow already {current['status']}")

    pending = current.get("pending_checkpoint") or {}
    if pending and pending.get("step") != body.checkpoint:
        raise HTTPException(
            status_code=400,
            detail=f"Expected checkpoint '{pending.get('step')}', got '{body.checkpoint}'",
        )

    result = await resume_workflow(workflow_id, approved=body.approved)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result


@router.post("/workflows/{workflow_id}/reject")
async def reject_workflow(workflow_id: str):
    current = await get_workflow_status(workflow_id)
    if not current:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if current.get("status") in ("completed", "failed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Workflow already {current['status']}")
    result = await resume_workflow(workflow_id, approved=False)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result
