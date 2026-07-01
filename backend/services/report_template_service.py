"""Jinja2-based professional report HTML rendering."""
from __future__ import annotations

import html
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "reports"
VALID_TEMPLATES = frozenset(
    {"equity_research", "due_diligence", "portfolio_review", "pitch_deck"}
)

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _fmt_price(value: float | int | None) -> str:
    if value is None:
        return "N/A"
    return f"${float(value):,.2f}"


def _build_context(payload: dict, branding: dict | None = None) -> dict:
    memo = payload.get("memo") or {}
    ticker = str(payload.get("ticker", ""))
    distribution = memo.get("distribution") or {}
    sovereign = payload.get("sovereign_score")
    detail = payload.get("sovereign_score_detail") or {}
    score_val = (
        sovereign
        if isinstance(sovereign, (int, float))
        else (sovereign or {}).get("score")
    )
    components = detail.get("components") or (
        sovereign.get("components", {}) if isinstance(sovereign, dict) else {}
    )
    branding = branding or payload.get("branding") or {}
    export_narrative = payload.get("export_narrative") or {}

    return {
        "ticker": ticker,
        "ticker_escaped": html.escape(ticker),
        "memo": memo,
        "generated": datetime.now(timezone.utc).strftime("%B %d, %Y %H:%M UTC"),
        "distribution": distribution,
        "distribution_rows": [
            {
                "label": case.capitalize(),
                "price": _fmt_price((distribution.get(case) or {}).get("price")),
                "prob": f"{(distribution.get(case) or {}).get('probability', 0) * 100:.0f}%",
            }
            for case in ("bear", "base", "bull")
        ],
        "thesis_points": payload.get("thesis_points") or [],
        "warnings": memo.get("audit_warnings") or [],
        "score_val": score_val if score_val is not None else "N/A",
        "components": components,
        "summary": export_narrative.get("summary") or memo.get("summary", ""),
        "bull_verdict": export_narrative.get("bull_verdict") or memo.get("bull_verdict", ""),
        "bear_verdict": export_narrative.get("bear_verdict") or memo.get("bear_verdict", ""),
        "firm_name": branding.get("firm_name") or "Sovereign-Alpha Intelligence",
        "logo_url": branding.get("logo_url"),
        "disclaimer": branding.get(
            "disclaimer",
            "This report is generated for informational purposes only. "
            "It does not constitute investment advice.",
        ),
        "portfolio": payload.get("portfolio") or {},
        "citations": payload.get("agent_traces") or [],
        "fmt_price": _fmt_price,
    }


def render_report_html(
    template: str,
    payload: dict,
    branding: dict | None = None,
) -> str:
    key = template if template in VALID_TEMPLATES else "equity_research"
    tmpl = _env.get_template(f"{key}.html.j2")
    return tmpl.render(**_build_context(payload, branding))
