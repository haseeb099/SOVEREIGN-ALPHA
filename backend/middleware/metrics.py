"""Prometheus metrics instrumentation."""
from __future__ import annotations

import os

from fastapi import FastAPI, Request, Response
from starlette.responses import PlainTextResponse

_metrics_enabled = os.environ.get("PROMETHEUS_METRICS_ENABLED", "true").lower() == "true"
_instrumentator = None


def setup_metrics(app: FastAPI) -> None:
    global _instrumentator
    if not _metrics_enabled:
        return
    try:
        from prometheus_fastapi_instrumentator import Instrumentator

        _instrumentator = Instrumentator(
            should_group_status_codes=True,
            should_ignore_untemplated=True,
            excluded_handlers=["/metrics", "/health"],
        )
        _instrumentator.instrument(app)
    except ImportError:
        _instrumentator = None


def register_metrics_route(app: FastAPI) -> None:
    if not _metrics_enabled:
        return

    @app.get("/metrics", include_in_schema=False)
    async def metrics(request: Request):
        if os.environ.get("ENVIRONMENT") == "production":
            token = request.headers.get("X-Metrics-Token") or request.headers.get(
                "Authorization", ""
            ).removeprefix("Bearer ")
            expected = os.environ.get("METRICS_AUTH_TOKEN", "")
            if expected and token != expected:
                return Response(status_code=401, content="Unauthorized")
        try:
            from prometheus_client import CONTENT_TYPE_LATEST, REGISTRY, generate_latest

            return Response(
                generate_latest(REGISTRY),
                media_type=CONTENT_TYPE_LATEST,
            )
        except Exception:
            return PlainTextResponse("# metrics unavailable\n", media_type="text/plain")
