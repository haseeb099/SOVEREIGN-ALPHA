"""Async SQLAlchemy database engine and session factory."""
import asyncio
import logging
import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://sovereign:sovereign@localhost:5433/sovereign_alpha",
)


def _to_async_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _engine_connect_args(url: str) -> dict:
    if "sslmode=require" in url or "render.com" in url:
        return {"ssl": True}
    return {}


engine = create_async_engine(
    _to_async_url(DATABASE_URL),
    echo=False,
    connect_args=_engine_connect_args(DATABASE_URL),
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Run Alembic migrations or fall back to create_all for dev/test."""
    import models  # noqa: F401

    environment = os.environ.get("ENVIRONMENT", "development")
    try:
        from alembic import command
        from alembic.config import Config

        alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, command.upgrade, alembic_cfg, "head")
        logger.info("Alembic migrations applied")
    except Exception as e:
        if environment == "production":
            logger.error("Alembic upgrade failed in production — aborting startup: %s", e)
            raise
        logger.error(
            "Alembic upgrade failed (%s) — falling back to create_all. "
            "Run: docker compose build backend && docker compose up -d && alembic upgrade head",
            e,
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
