"""GET /api/audit — admin-only audit log access."""
import uuid

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from services.audit_service import export_events, list_events
from services.permission_service import get_org_id, require_permission

router = APIRouter()


@router.get("/audit")
async def get_audit_log(
    request: Request,
    action: str | None = None,
    resource_type: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    require_permission(request, "audit:read")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    events = await list_events(
        org_id,
        action=action,
        resource_type=resource_type,
        limit=limit,
        offset=offset,
    )
    return {"org_id": str(org_id), "count": len(events), "events": events}


@router.get("/audit/export")
async def export_audit_log(
    request: Request,
    format: str = Query("json", pattern="^(json|csv)$"),
):
    require_permission(request, "audit:export")
    org_id = get_org_id(request)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organisation context required")
    content = await export_events(org_id, fmt=format)
    media = "text/csv" if format == "csv" else "application/json"
    return PlainTextResponse(content=content, media_type=media)
