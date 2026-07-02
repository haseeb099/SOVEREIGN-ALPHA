"""Graceful database error handling when Postgres is offline."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal

logger = logging.getLogger(__name__)

DB_UNAVAILABLE_DETAIL = (
    "Database temporarily unavailable. Start Postgres with "
    "`docker compose up -d postgres` and set SKIP_DB_INIT=false."
)


def is_db_connection_error(exc: BaseException) -> bool:
    if isinstance(exc, OperationalError):
        return True
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "connection refused",
            "connect call failed",
            "could not connect",
            "timeout",
            "name or service not known",
            "server closed the connection",
        )
    )


def raise_db_unavailable(exc: BaseException | None = None) -> None:
    if exc:
        logger.debug("Database unavailable: %s", exc)
    raise HTTPException(status_code=503, detail=DB_UNAVAILABLE_DETAIL)


@asynccontextmanager
async def db_session_or_503() -> AsyncGenerator[AsyncSession, None]:
    """Yield a DB session or raise 503 when the database is unreachable."""
    try:
        async with AsyncSessionLocal() as session:
            yield session
    except (OperationalError, SQLAlchemyError, OSError) as exc:
        if is_db_connection_error(exc):
            raise_db_unavailable(exc)
        raise
    except Exception as exc:
        if is_db_connection_error(exc):
            raise_db_unavailable(exc)
        raise
