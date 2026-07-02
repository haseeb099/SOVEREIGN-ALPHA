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
    args: dict = {"timeout": 5}
    if "sslmode=require" in url or "render.com" in url:
        args["ssl"] = True
    return args


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

    if os.environ.get("SKIP_DB_INIT", "").lower() in ("1", "true", "yes"):
        logger.warning("SKIP_DB_INIT set — database migrations skipped")
        return

    environment = os.environ.get("ENVIRONMENT", "development")
    try:
        from alembic import command
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from sqlalchemy import text

        alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        script = ScriptDirectory.from_config(alembic_cfg)
        head = script.get_current_head()

        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
            current = result.scalar_one_or_none()

        if current == head:
            logger.info("Alembic already at head (%s) — skipping upgrade", head)
            return

        loop = asyncio.get_event_loop()
        await asyncio.wait_for(
            loop.run_in_executor(None, command.upgrade, alembic_cfg, "head"),
            timeout=30,
        )
        logger.info("Alembic migrations applied")
    except Exception as e:
        if environment == "production":
            logger.error("Alembic upgrade failed in production — aborting startup: %s", e)
            raise
        logger.error(
            "Alembic upgrade failed (%s) — falling back to create_all. "
            "Run: docker compose up -d postgres && alembic upgrade head",
            e,
        )
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        except Exception as create_err:
            if environment == "production":
                raise
            logger.warning("create_all skipped (database unavailable): %s", create_err)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
