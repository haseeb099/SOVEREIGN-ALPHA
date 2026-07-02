"""Enterprise lead capture."""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, Field

from database import AsyncSessionLocal
from models import EnterpriseLead
from services.db_guard import require_db

router = APIRouter()
logger = logging.getLogger(__name__)


class EnterpriseLeadRequest(BaseModel):
    firm: str = Field(..., min_length=1, max_length=256)
    email: EmailStr
    aum_band: str | None = Field(None, max_length=64)
    message: str | None = Field(None, max_length=4000)


async def _notify_sales(body: EnterpriseLeadRequest) -> bool:
    api_key = os.environ.get("RESEND_API_KEY", "")
    sales_email = os.environ.get("ENTERPRISE_SALES_EMAIL", "")
    if not api_key or not sales_email:
        return False
    try:
        import resend

        resend.api_key = api_key
        from_email = os.environ.get("RESEND_FROM_EMAIL", "noreply@sovereign-alpha.com")
        resend.Emails.send(
            {
                "from": from_email,
                "to": [sales_email],
                "subject": f"Enterprise lead: {body.firm}",
                "html": (
                    f"<p><strong>Firm:</strong> {body.firm}</p>"
                    f"<p><strong>Email:</strong> {body.email}</p>"
                    f"<p><strong>AUM:</strong> {body.aum_band or '—'}</p>"
                    f"<p><strong>Message:</strong> {body.message or '—'}</p>"
                ),
            }
        )
        return True
    except Exception as exc:
        logger.warning("Enterprise lead email failed: %s", exc)
        return False


@router.post("/enterprise/leads")
async def create_lead(body: EnterpriseLeadRequest):
    require_db()
    async with AsyncSessionLocal() as session:
        row = EnterpriseLead(
            firm=body.firm.strip(),
            email=body.email.strip().lower(),
            aum_band=body.aum_band,
            message=body.message,
        )
        session.add(row)
        await session.commit()
    notified = await _notify_sales(body)
    return {"status": "received", "notified": notified}
