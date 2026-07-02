"""Team workspaces — shared theses, annotations, approvals."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from models import (
    ApprovalRequest,
    SharedThesis,
    ThesisAnnotation,
    Workspace,
    WorkspaceMember,
)
from services.audit_service import record_event
from services.db_guard import require_db
from services.permission_service import get_org_id, require_permission

router = APIRouter()


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class ShareThesisRequest(BaseModel):
    ticker: str
    analysis_id: str | None = None
    status: str = "draft"


class AnnotationRequest(BaseModel):
    thesis_id: str
    content: str = Field(..., min_length=1, max_length=4000)
    section_ref: str | None = None


class ApprovalRequestBody(BaseModel):
    resource_type: str = "shared_thesis"
    resource_id: str
    notes: str | None = None


class ApprovalDecision(BaseModel):
    notes: str | None = None


async def _get_workspace(workspace_id: str, org_id: uuid.UUID) -> Workspace:
    try:
        wid = uuid.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workspace id")
    async with AsyncSessionLocal() as session:
        ws = await session.get(Workspace, wid)
        if not ws or ws.org_id != org_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return ws


@router.post("/workspaces")
async def create_workspace(body: WorkspaceCreate, request: Request):
    user_id = require_permission(request, "workspace:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    async with AsyncSessionLocal() as session:
        ws = Workspace(org_id=org_id, name=body.name, created_by=user_id)
        session.add(ws)
        await session.flush()
        session.add(WorkspaceMember(workspace_id=ws.id, user_id=user_id, role="owner"))
        await session.commit()
        await session.refresh(ws)
    await record_event(org_id, user_id, "workspace.create", "workspace", str(ws.id), {"name": body.name})
    return {"id": str(ws.id), "name": ws.name}


@router.get("/workspaces")
async def list_workspaces(request: Request):
    require_permission(request, "workspace:read")
    require_db()
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(select(Workspace).where(Workspace.org_id == org_id))
        ).scalars().all()
        return {"workspaces": [{"id": str(r.id), "name": r.name} for r in rows]}


@router.get("/workspaces/{workspace_id}")
async def get_workspace(workspace_id: str, request: Request):
    require_permission(request, "workspace:read")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    ws = await _get_workspace(workspace_id, org_id)
    async with AsyncSessionLocal() as session:
        members = (
            await session.execute(
                select(WorkspaceMember).where(WorkspaceMember.workspace_id == ws.id)
            )
        ).scalars().all()
        theses = (
            await session.execute(
                select(SharedThesis).where(SharedThesis.workspace_id == ws.id)
            )
        ).scalars().all()
    return {
        "id": str(ws.id),
        "name": ws.name,
        "members": [{"user_id": m.user_id, "role": m.role} for m in members],
        "shared_theses": [
            {
                "id": str(t.id),
                "ticker": t.ticker,
                "analysis_id": str(t.analysis_id) if t.analysis_id else None,
                "status": t.status,
                "shared_by": t.shared_by,
            }
            for t in theses
        ],
    }


@router.post("/workspaces/{workspace_id}/theses")
async def share_thesis(workspace_id: str, body: ShareThesisRequest, request: Request):
    user_id = require_permission(request, "thesis:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    ws = await _get_workspace(workspace_id, org_id)
    analysis_uuid = None
    if body.analysis_id:
        try:
            analysis_uuid = uuid.UUID(body.analysis_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid analysis_id")
    async with AsyncSessionLocal() as session:
        row = SharedThesis(
            workspace_id=ws.id,
            ticker=body.ticker.upper(),
            analysis_id=analysis_uuid,
            status=body.status,
            shared_by=user_id,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    await record_event(
        org_id, user_id, "thesis.share", "shared_thesis", str(row.id), {"ticker": body.ticker}
    )
    return {"id": str(row.id), "status": row.status}


@router.post("/workspaces/{workspace_id}/annotations")
async def add_annotation(workspace_id: str, body: AnnotationRequest, request: Request):
    user_id = require_permission(request, "thesis:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    ws = await _get_workspace(workspace_id, org_id)
    try:
        thesis_uuid = uuid.UUID(body.thesis_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid thesis_id")
    async with AsyncSessionLocal() as session:
        row = ThesisAnnotation(
            workspace_id=ws.id,
            thesis_id=thesis_uuid,
            user_id=user_id,
            content=body.content,
            section_ref=body.section_ref,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    await record_event(org_id, user_id, "annotation.create", "annotation", str(row.id))
    return {"id": str(row.id), "content": row.content, "section_ref": row.section_ref}


@router.post("/workspaces/{workspace_id}/approvals")
async def request_approval(workspace_id: str, body: ApprovalRequestBody, request: Request):
    user_id = require_permission(request, "approval:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    ws = await _get_workspace(workspace_id, org_id)
    try:
        resource_uuid = uuid.UUID(body.resource_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid resource_id")
    async with AsyncSessionLocal() as session:
        row = ApprovalRequest(
            workspace_id=ws.id,
            resource_type=body.resource_type,
            resource_id=resource_uuid,
            requested_by=user_id,
            notes=body.notes,
            status="pending",
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    await record_event(org_id, user_id, "approval.request", "approval", str(row.id))
    return {"id": str(row.id), "status": row.status}


@router.post("/workspaces/{workspace_id}/approvals/{approval_id}/approve")
async def approve_request(
    workspace_id: str, approval_id: str, body: ApprovalDecision, request: Request
):
    user_id = require_permission(request, "approval:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    await _get_workspace(workspace_id, org_id)
    return await _resolve_approval(approval_id, user_id, org_id, approved=True, notes=body.notes)


@router.post("/workspaces/{workspace_id}/approvals/{approval_id}/reject")
async def reject_request(
    workspace_id: str, approval_id: str, body: ApprovalDecision, request: Request
):
    user_id = require_permission(request, "approval:write")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    await _get_workspace(workspace_id, org_id)
    return await _resolve_approval(approval_id, user_id, org_id, approved=False, notes=body.notes)


async def _resolve_approval(
    approval_id: str,
    user_id: str,
    org_id: uuid.UUID,
    *,
    approved: bool,
    notes: str | None,
):
    try:
        aid = uuid.UUID(approval_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid approval id")
    async with AsyncSessionLocal() as session:
        row = await session.get(ApprovalRequest, aid)
        if not row:
            raise HTTPException(status_code=404, detail="Approval not found")
        if row.status != "pending":
            raise HTTPException(status_code=400, detail=f"Already {row.status}")
        row.status = "approved" if approved else "rejected"
        row.approved_by = user_id
        row.notes = notes or row.notes
        row.resolved_at = datetime.now(timezone.utc)
        if row.resource_type == "shared_thesis":
            thesis = await session.get(SharedThesis, row.resource_id)
            if thesis:
                thesis.status = "approved" if approved else "rejected"
        await session.commit()
    action = "approval.approve" if approved else "approval.reject"
    await record_event(org_id, user_id, action, "approval", approval_id)
    return {"id": approval_id, "status": "approved" if approved else "rejected"}
