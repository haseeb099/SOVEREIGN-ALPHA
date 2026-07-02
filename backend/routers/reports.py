"""PDF report generation, secure shares, versions, and diff."""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
import bcrypt

from database import AsyncSessionLocal
from middleware.auth import resolve_user_id
from models import Report
from services.plan_service import require_pro_plan
from services.report_diff_service import diff_reports
from services.report_polish_service import polish_report_narrative
from services.report_template_service import render_report_html, VALID_TEMPLATES

router = APIRouter()
logger = logging.getLogger(__name__)

UNLOCK_SECRET = os.environ.get("REPORT_UNLOCK_SECRET", "dev-report-unlock-secret")
UNLOCK_TTL_SECONDS = 3600


class BrandingConfig(BaseModel):
    firm_name: str | None = None
    logo_url: str | None = None
    disclaimer: str | None = None


class ReportGenerateRequest(BaseModel):
    ticker: str
    analysis: dict
    template: str = "equity_research"
    expires_in_days: int = Field(30, ge=1, le=365)
    password: str | None = None
    polish: bool = True
    branding: BrandingConfig | None = None
    corpus_id: str | None = None
    parent_report_id: str | None = None
    analysis_id: str | None = None
    portfolio: dict | None = None


class UnlockRequest(BaseModel):
    password: str


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def _create_unlock_token(report_id: str, share_token: str) -> str:
    payload = {
        "sub": report_id,
        "token": share_token,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=UNLOCK_TTL_SECONDS),
    }
    return jwt.encode(payload, UNLOCK_SECRET, algorithm="HS256")


def _verify_unlock_token(token: str, share_token: str) -> bool:
    try:
        payload = jwt.decode(token, UNLOCK_SECRET, algorithms=["HS256"])
        return payload.get("token") == share_token
    except Exception:
        return False


def _check_password_access(request: Request, row: Report) -> None:
    if not row.password_hash:
        return
    unlock = request.headers.get("X-Report-Unlock") or request.cookies.get("report_unlock")
    if unlock and _verify_unlock_token(unlock, row.share_token):
        return
    raise HTTPException(status_code=401, detail="Password required")


async def _get_report_row(token: str) -> Report:
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(select(Report).where(Report.share_token == token))
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        if row.expires_at and row.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Report expired")
        return row


@router.post("/reports/generate")
async def generate_report(request: Request, body: ReportGenerateRequest):
    await require_pro_plan(request)
    user_id = resolve_user_id(request)
    template = body.template if body.template in VALID_TEMPLATES else "equity_research"

    payload = dict(body.analysis)
    if body.portfolio:
        payload["portfolio"] = body.portfolio
    if body.branding:
        payload["branding"] = body.branding.model_dump(exclude_none=True)
    if body.polish:
        payload["export_narrative"] = await polish_report_narrative(payload, template)

    version = 1
    parent_id = None
    if body.parent_report_id:
        try:
            parent_id = uuid.UUID(body.parent_report_id)
            async with AsyncSessionLocal() as session:
                parent = await session.get(Report, parent_id)
                if parent:
                    version = (parent.version or 1) + 1
        except ValueError:
            pass

    analysis_uuid = None
    if body.analysis_id:
        try:
            analysis_uuid = uuid.UUID(body.analysis_id)
        except ValueError:
            pass
    elif payload.get("analysis_id"):
        try:
            analysis_uuid = uuid.UUID(str(payload["analysis_id"]))
        except ValueError:
            pass

    corpus_uuid = None
    if body.corpus_id:
        try:
            corpus_uuid = uuid.UUID(body.corpus_id)
        except ValueError:
            pass

    token = secrets.token_urlsafe(24)
    expires = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
    password_hash = _hash_password(body.password) if body.password else None

    async with AsyncSessionLocal() as session:
        row = Report(
            user_id=user_id,
            ticker=body.ticker.upper(),
            share_token=token,
            expires_at=expires,
            expires_in_days=body.expires_in_days,
            payload=payload,
            template=template,
            password_hash=password_hash,
            version=version,
            parent_report_id=parent_id,
            analysis_id=analysis_uuid,
            corpus_id=corpus_uuid,
            branding=body.branding.model_dump(exclude_none=True) if body.branding else None,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return {
            "id": str(row.id),
            "share_token": token,
            "share_url": f"/reports/{token}",
            "expires_at": expires.isoformat(),
            "version": version,
            "template": template,
            "password_protected": password_hash is not None,
        }


@router.post("/reports/{token}/unlock")
async def unlock_report(token: str, body: UnlockRequest):
    row = await _get_report_row(token)
    if not row.password_hash:
        return {"unlocked": True, "unlock_token": _create_unlock_token(str(row.id), token)}
    if not _verify_password(body.password, row.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")
    unlock_token = _create_unlock_token(str(row.id), token)
    response = Response(
        content='{"unlocked": true}',
        media_type="application/json",
    )
    response.set_cookie(
        "report_unlock",
        unlock_token,
        max_age=UNLOCK_TTL_SECONDS,
        httponly=True,
        samesite="lax",
    )
    return {"unlocked": True, "unlock_token": unlock_token}


@router.get("/reports/history")
async def report_history(request: Request, ticker: str):
    user_id = resolve_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(Report)
                .where(Report.user_id == user_id, Report.ticker == ticker.upper())
                .order_by(Report.version.desc(), Report.created_at.desc())
            )
        ).scalars().all()
        return {
            "ticker": ticker.upper(),
            "versions": [
                {
                    "id": str(r.id),
                    "version": r.version,
                    "template": r.template,
                    "share_token": r.share_token,
                    "created_at": r.created_at.isoformat(),
                    "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                    "password_protected": bool(r.password_hash),
                }
                for r in rows
            ],
        }


@router.get("/reports/diff")
async def report_diff(request: Request, from_id: str, to_id: str):
    user_id = resolve_user_id(request)
    try:
        fid, tid = uuid.UUID(from_id), uuid.UUID(to_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid report id")
    async with AsyncSessionLocal() as session:
        row_a = await session.get(Report, fid)
        row_b = await session.get(Report, tid)
        if not row_a or not row_b:
            raise HTTPException(status_code=404, detail="Report not found")
        if user_id and row_a.user_id and row_a.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
    return {
        "from_id": from_id,
        "to_id": to_id,
        "diff": diff_reports(row_a.payload, row_b.payload),
    }


@router.get("/reports/{token}")
async def get_report(token: str, request: Request):
    row = await _get_report_row(token)
    _check_password_access(request, row)
    return {
        "id": str(row.id),
        "ticker": row.ticker,
        "payload": row.payload,
        "template": row.template,
        "version": row.version,
        "created_at": row.created_at.isoformat(),
        "password_protected": bool(row.password_hash),
    }


@router.get("/reports/{token}/html", response_class=HTMLResponse)
async def report_html(token: str, request: Request):
    row = await _get_report_row(token)
    _check_password_access(request, row)
    return HTMLResponse(
        render_report_html(row.template, row.payload, row.branding)
    )


@router.get("/reports/{token}/pdf")
async def report_pdf(token: str, request: Request):
    row = await _get_report_row(token)
    _check_password_access(request, row)
    html_content = render_report_html(row.template, row.payload, row.branding)
    ticker = row.ticker

    try:
        from weasyprint import HTML

        pdf_bytes = HTML(string=html_content).write_pdf()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{ticker}-report.pdf"'},
        )
    except ImportError:
        logger.warning("WeasyPrint not installed — returning HTML fallback")
        return Response(
            content=html_content.encode("utf-8"),
            media_type="text/html",
            headers={"Content-Disposition": f'attachment; filename="{ticker}-report.html"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}") from exc


class ReportSendRequest(BaseModel):
    to: str


@router.post("/reports/{report_id}/send")
async def send_report(report_id: str, request: Request, body: ReportSendRequest):
    """Email report via Resend when RESEND_API_KEY is configured."""
    import re

    import httpx

    to_email = body.to.strip()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", to_email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        return {
            "status": "deferred",
            "detail": "RESEND_API_KEY not configured — email delivery not available",
        }

    from_email = os.environ.get("RESEND_FROM_EMAIL", "reports@sovereign-alpha.local")

    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(select(Report).where(Report.share_token == report_id))
        ).scalar_one_or_none()
        if not row:
            try:
                row = (
                    await session.execute(
                        select(Report).where(Report.id == uuid.UUID(report_id))
                    )
                ).scalar_one_or_none()
            except ValueError:
                row = None
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")

    share_url = f"/reports/{row.share_token}"
    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": f"{row.ticker} — Sovereign-Alpha Research Report",
        "html": (
            f"<p>Your shared research report for <strong>{row.ticker}</strong> is ready.</p>"
            f'<p><a href="{share_url}">View report</a> · '
            f'<a href="{share_url}/pdf">Download PDF</a></p>'
        ),
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Resend error: {resp.text[:200]}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Email send failed: {exc}") from exc

    return {"status": "sent", "report_id": str(row.id), "to": to_email}
