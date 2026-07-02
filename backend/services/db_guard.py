"""Graceful degradation when Postgres is offline (SKIP_DB_INIT=true)."""
from __future__ import annotations

import logging
import os

from fastapi import HTTPException

logger = logging.getLogger(__name__)

_USER_UNAVAILABLE = "Feature temporarily unavailable"


def db_skipped() -> bool:
    return os.environ.get("SKIP_DB_INIT", "").lower() in ("1", "true", "yes")


def require_db() -> None:
    """Raise 503 when the API started without database migrations."""
    if db_skipped():
        logger.warning(
            "Database unavailable — start Postgres (docker compose up -d postgres), "
            "set SKIP_DB_INIT=false, then run: pnpm db:migrate"
        )
        raise HTTPException(status_code=503, detail=_USER_UNAVAILABLE)
