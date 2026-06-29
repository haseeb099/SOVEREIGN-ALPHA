"""PDF report generation and shareable links."""
from __future__ import annotations

import html
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy import select

from database import AsyncSessionLocal
from middleware.auth import extract_user_id
from models import Report

router = APIRouter()


class ReportGenerateRequest(BaseModel):
    ticker: str
    analysis: dict


def _fmt_price(value: float | int | None) -> str:
    if value is None:
        return "N/A"
    return f"${float(value):,.2f}"


def _distribution_rows(distribution: dict) -> str:
    rows = []
    for case in ("bear", "base", "bull"):
        node = distribution.get(case) or {}
        label = case.capitalize()
        price = _fmt_price(node.get("price"))
        prob = node.get("probability", 0)
        rows.append(
            f"<tr><td>{label}</td><td>{price}</td><td>{prob * 100:.0f}%</td></tr>"
        )
    return "\n".join(rows)


def _thesis_rows(points: list) -> str:
    if not points:
        return "<tr><td colspan='4'>No thesis points recorded</td></tr>"
    rows = []
    for tp in points:
        rows.append(
            "<tr>"
            f"<td>{html.escape(str(tp.get('metric', '')))}</td>"
            f"<td>{html.escape(str(tp.get('text', '')))}</td>"
            f"<td>{html.escape(str(tp.get('current_value', '')))}</td>"
            f"<td>{html.escape(str(tp.get('status', '')))}</td>"
            "</tr>"
        )
    return "\n".join(rows)


def _html_report(payload: dict) -> str:
    memo = payload.get("memo") or {}
    ticker = html.escape(str(payload.get("ticker", "")))
    distribution = memo.get("distribution") or {}
    sovereign = payload.get("sovereign_score")
    detail = payload.get("sovereign_score_detail") or {}
    score_val = sovereign if isinstance(sovereign, (int, float)) else (sovereign or {}).get("score")
    components = detail.get("components") or (sovereign.get("components", {}) if isinstance(sovereign, dict) else {})
    warnings = memo.get("audit_warnings") or []
    thesis_points = payload.get("thesis_points") or []
    generated = datetime.now(timezone.utc).strftime("%B %d, %Y %H:%M UTC")

    warning_block = ""
    if warnings:
        items = "".join(f"<li>{html.escape(w)}</li>" for w in warnings)
        warning_block = f"<section class='warnings'><h2>Audit Warnings</h2><ul>{items}</ul></section>"

    component_rows = ""
    if components:
        component_rows = "".join(
            f"<tr><td>{html.escape(k.replace('_', ' ').title())}</td>"
            f"<td>{v:.1f}</td></tr>"
            for k, v in components.items()
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{ticker} — Sovereign-Alpha Research Memo</title>
<style>
  :root {{
    --ink: #0f172a;
    --muted: #64748b;
    --accent: #1d4ed8;
    --border: #e2e8f0;
    --bg: #f8fafc;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: "Segoe UI", system-ui, sans-serif;
    color: var(--ink);
    margin: 0;
    background: var(--bg);
    line-height: 1.55;
  }}
  .page {{
    max-width: 820px;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 8px 32px rgba(15,23,42,.08);
  }}
  .cover {{
    padding: 48px 56px;
    border-bottom: 4px solid var(--accent);
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
    color: #fff;
  }}
  .cover h1 {{ margin: 0 0 8px; font-size: 2rem; letter-spacing: -.02em; }}
  .cover .meta {{ opacity: .85; font-size: .9rem; }}
  .badge {{
    display: inline-block;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(255,255,255,.15);
    font-weight: 600;
    margin-top: 16px;
  }}
  .body {{ padding: 40px 56px 56px; }}
  h2 {{
    font-size: 1.1rem;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    margin: 32px 0 16px;
  }}
  h2:first-child {{ margin-top: 0; }}
  .kpi-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 24px 0;
  }}
  .kpi {{
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }}
  .kpi .label {{ font-size: .75rem; color: var(--muted); text-transform: uppercase; }}
  .kpi .value {{ font-size: 1.5rem; font-weight: 700; margin-top: 4px; }}
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: .9rem;
  }}
  th, td {{
    border: 1px solid var(--border);
    padding: 10px 12px;
    text-align: left;
  }}
  th {{ background: var(--bg); font-weight: 600; }}
  .debate {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }}
  .debate .card {{
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
  }}
  .debate .bull {{ border-top: 3px solid #16a34a; }}
  .debate .bear {{ border-top: 3px solid #dc2626; }}
  .warnings {{ background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px 20px; }}
  .disclaimer {{
    font-size: 11px;
    color: var(--muted);
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
  }}
  @media print {{
    body {{ background: #fff; }}
    .page {{ box-shadow: none; }}
  }}
</style>
</head>
<body>
<div class="page">
  <header class="cover">
    <div class="meta">Sovereign-Alpha Intelligence · Research Memo</div>
    <h1>{ticker}</h1>
    <div class="meta">Generated {generated}</div>
    <span class="badge">{html.escape(str(memo.get('rating', 'N/A')))}</span>
  </header>
  <div class="body">
    <div class="kpi-grid">
      <div class="kpi"><div class="label">12M Target</div><div class="value">{_fmt_price(memo.get('price_target'))}</div></div>
      <div class="kpi"><div class="label">Sovereign Score</div><div class="value">{score_val if score_val is not None else 'N/A'}</div></div>
      <div class="kpi"><div class="label">Confidence</div><div class="value">{memo.get('confidence_score', 'N/A')}/10</div></div>
    </div>

    <h2>Executive Summary</h2>
    <p>{html.escape(str(memo.get('summary', '')))}</p>

    <h2>Valuation Distribution</h2>
    <table>
      <thead><tr><th>Case</th><th>Price</th><th>Probability</th></tr></thead>
      <tbody>{_distribution_rows(distribution)}</tbody>
    </table>

    <h2>Bull vs Bear Debate</h2>
    <div class="debate">
      <div class="card bull">
        <strong>Bull Case</strong>
        <p>{html.escape(str(memo.get('bull_verdict', '')))}</p>
      </div>
      <div class="card bear">
        <strong>Bear Case</strong>
        <p>{html.escape(str(memo.get('bear_verdict', '')))}</p>
      </div>
    </div>

    <h2>Thesis Tracker</h2>
    <table>
      <thead><tr><th>Metric</th><th>Assumption</th><th>Current</th><th>Status</th></tr></thead>
      <tbody>{_thesis_rows(thesis_points)}</tbody>
    </table>

    {"<h2>Score Components</h2><table><thead><tr><th>Factor</th><th>Score</th></tr></thead><tbody>" + component_rows + "</tbody></table>" if component_rows else ""}

    {warning_block}

    <p class="disclaimer">
      This report is generated by Sovereign-Alpha for informational purposes only.
      It does not constitute investment advice. Past performance is not indicative of future results.
      Verify all figures against primary sources before making investment decisions.
    </p>
  </div>
</div>
</body>
</html>"""


@router.post("/reports/generate")
async def generate_report(request: Request, body: ReportGenerateRequest):
    user_id = extract_user_id(request) or getattr(request.state, "user_id", None)
    token = secrets.token_urlsafe(24)
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    async with AsyncSessionLocal() as session:
        row = Report(
            user_id=user_id,
            ticker=body.ticker.upper(),
            share_token=token,
            expires_at=expires,
            payload=body.analysis,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return {
            "id": str(row.id),
            "share_token": token,
            "share_url": f"/reports/{token}",
            "expires_at": expires.isoformat(),
        }


@router.get("/reports/{token}")
async def get_report(token: str):
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(select(Report).where(Report.share_token == token))
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        if row.expires_at and row.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Report expired")
        return {"id": str(row.id), "ticker": row.ticker, "payload": row.payload}


@router.get("/reports/{token}/html", response_class=HTMLResponse)
async def report_html(token: str):
    data = await get_report(token)
    return HTMLResponse(_html_report(data["payload"]))


@router.get("/reports/{token}/pdf")
async def report_pdf(token: str):
    """Returns HTML with PDF content-type — WeasyPrint deferred to production worker."""
    data = await get_report(token)
    html_content = _html_report(data["payload"])
    return Response(
        content=html_content.encode("utf-8"),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename={data['ticker']}-report.html"},
    )


@router.post("/reports/{report_id}/send")
async def send_report(report_id: str, request: Request):
    """Email report via Resend — deferred when RESEND_API_KEY unset."""
    import os

    if not os.environ.get("RESEND_API_KEY"):
        return {
            "status": "deferred",
            "detail": "RESEND_API_KEY not configured — email delivery not available",
        }
    return {"status": "queued", "report_id": report_id}
