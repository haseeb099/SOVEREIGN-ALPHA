"""Async SQLAlchemy database engine and session factory."""
import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

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
    """Enable SSL for managed Postgres providers (e.g. Render external URLs)."""
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
    from models import IngestedDocument, PortfolioSnapshot, ThesisAnalysis  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
