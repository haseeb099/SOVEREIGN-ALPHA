"""Watchlist CRUD."""
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from database import AsyncSessionLocal
from middleware.auth import extract_user_id
from models import Watchlist

router = APIRouter()


class WatchlistCreate(BaseModel):
    name: str = "Default"
    tickers: list[str] = []


class WatchlistUpdate(BaseModel):
    tickers: list[str]


def _require_user(request: Request) -> str:
    user_id = extract_user_id(request) or getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


@router.get("/watchlists")
async def list_watchlists(request: Request):
    user_id = _require_user(request)
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(select(Watchlist).where(Watchlist.user_id == user_id))
        ).scalars().all()
        return {
            "watchlists": [
                {"id": str(r.id), "name": r.name, "tickers": r.tickers or []} for r in rows
            ]
        }


@router.post("/watchlists")
async def create_watchlist(request: Request, body: WatchlistCreate):
    user_id = _require_user(request)
    async with AsyncSessionLocal() as session:
        row = Watchlist(
            user_id=user_id,
            name=body.name,
            tickers=[t.upper() for t in body.tickers],
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return {"id": str(row.id), "name": row.name, "tickers": row.tickers}


@router.delete("/watchlists/{watchlist_id}")
async def delete_watchlist(request: Request, watchlist_id: str):
    user_id = _require_user(request)
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                select(Watchlist).where(
                    Watchlist.id == uuid.UUID(watchlist_id), Watchlist.user_id == user_id
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Watchlist not found")
        await session.delete(row)
        await session.commit()
        return {"deleted": watchlist_id}
