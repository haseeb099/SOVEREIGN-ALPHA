"""Structured diff between two report payloads."""
from __future__ import annotations

import difflib
from typing import Any


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _thesis_key(point: dict) -> str:
    return f"{point.get('metric', '')}|{point.get('threshold', '')}|{point.get('text', '')[:80]}"


def diff_reports(payload_a: dict, payload_b: dict) -> dict:
    memo_a = payload_a.get("memo") or {}
    memo_b = payload_b.get("memo") or {}

    rating_a = memo_a.get("rating")
    rating_b = memo_b.get("rating")
    target_a = memo_a.get("price_target")
    target_b = memo_b.get("price_target")

    rating_change = None
    if rating_a != rating_b:
        rating_change = {"from": rating_a, "to": rating_b}

    price_target_delta = None
    if target_a is not None and target_b is not None:
        try:
            delta = float(target_b) - float(target_a)
            if abs(delta) > 0.01:
                price_target_delta = {"from": target_a, "to": target_b, "delta": round(delta, 2)}
        except (TypeError, ValueError):
            pass

    points_a = {_thesis_key(p): p for p in (payload_a.get("thesis_points") or [])}
    points_b = {_thesis_key(p): p for p in (payload_b.get("thesis_points") or [])}
    keys_a, keys_b = set(points_a), set(points_b)

    thesis_diff = {
        "added": [points_b[k] for k in sorted(keys_b - keys_a)],
        "removed": [points_a[k] for k in sorted(keys_a - keys_b)],
        "changed": [],
    }
    for key in keys_a & keys_b:
        if points_a[key].get("text") != points_b[key].get("text"):
            thesis_diff["changed"].append(
                {"from": points_a[key], "to": points_b[key]}
            )

    summary_a = _normalize_text(memo_a.get("summary"))
    summary_b = _normalize_text(memo_b.get("summary"))
    summary_diff = list(
        difflib.unified_diff(
            summary_a.split(),
            summary_b.split(),
            lineterm="",
            n=2,
        )
    )

    warnings_a = set(memo_a.get("audit_warnings") or [])
    warnings_b = set(memo_b.get("audit_warnings") or [])

    return {
        "rating_change": rating_change,
        "price_target_delta": price_target_delta,
        "thesis_points": thesis_diff,
        "memo_sections": {"summary_diff": summary_diff},
        "audit_warnings": {
            "added": sorted(warnings_b - warnings_a),
            "removed": sorted(warnings_a - warnings_b),
        },
    }
