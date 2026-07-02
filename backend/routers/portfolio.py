"""Portfolio holdings CRUD, CSV import, summary."""
import csv
import io
import uuid

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import select

from database import AsyncSessionLocal
from models import Holding, User
from services.db_guard import require_db
from services.plan_service import require_pro_plan
from services.portfolio_service import compute_portfolio_summary

router = APIRouter()


class HoldingCreate(BaseModel):
    ticker: str
    shares: float = Field(ge=0)
    cost_basis: float = Field(ge=0)
    account_label: str | None = None


class HoldingUpdate(BaseModel):
    shares: float | None = None
    cost_basis: float | None = None
    account_label: str | None = None


def _require_user_id(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


async def _ensure_user(user_id: str) -> None:
    async with AsyncSessionLocal() as session:
        if not await session.get(User, user_id):
            session.add(User(id=user_id))
            await session.commit()


@router.get("/portfolio/holdings")
async def list_holdings(request: Request):
    await require_pro_plan(request)
    require_db()
    user_id = _require_user_id(request)
    async with AsyncSessionLocal() as session:
        stmt = select(Holding).where(Holding.user_id == user_id)
        rows = (await session.execute(stmt)).scalars().all()
        return {
            "holdings": [
                {
                    "id": str(h.id),
                    "ticker": h.ticker,
                    "shares": h.shares,
                    "cost_basis": h.cost_basis,
                    "account_label": h.account_label,
                }
                for h in rows
            ]
        }


@router.post("/portfolio/holdings")
async def create_holding(request: Request, body: HoldingCreate):
    await require_pro_plan(request)
    require_db()
    user_id = _require_user_id(request)
    await _ensure_user(user_id)
    async with AsyncSessionLocal() as session:
        h = Holding(
            user_id=user_id,
            ticker=body.ticker.upper(),
            shares=body.shares,
            cost_basis=body.cost_basis,
            account_label=body.account_label,
        )
        session.add(h)
        await session.commit()
        await session.refresh(h)
        return {"id": str(h.id), "ticker": h.ticker, "shares": h.shares}


@router.put("/portfolio/holdings/{holding_id}")
async def update_holding(request: Request, holding_id: str, body: HoldingUpdate):
    await require_pro_plan(request)
    require_db()
    user_id = _require_user_id(request)
    async with AsyncSessionLocal() as session:
        h = await session.get(Holding, uuid.UUID(holding_id))
        if not h or h.user_id != user_id:
            raise HTTPException(status_code=404, detail="Holding not found")
        if body.shares is not None:
            h.shares = body.shares
        if body.cost_basis is not None:
            h.cost_basis = body.cost_basis
        if body.account_label is not None:
            h.account_label = body.account_label
        await session.commit()
        return {"id": str(h.id), "ticker": h.ticker, "shares": h.shares}


@router.delete("/portfolio/holdings/{holding_id}")
async def delete_holding(request: Request, holding_id: str):
    await require_pro_plan(request)
    require_db()
    user_id = _require_user_id(request)
    async with AsyncSessionLocal() as session:
        h = await session.get(Holding, uuid.UUID(holding_id))
        if not h or h.user_id != user_id:
            raise HTTPException(status_code=404, detail="Holding not found")
        await session.delete(h)
        await session.commit()
        return {"deleted": holding_id}


@router.post("/portfolio/import")
async def import_csv(request: Request, file: UploadFile = File(...)):
    await require_pro_plan(request)
    require_db()
    user_id = _require_user_id(request)
    await _ensure_user(user_id)
    contents = await file.read()
    reader = csv.DictReader(io.StringIO(contents.decode("utf-8")))
    imported = []
    async with AsyncSessionLocal() as session:
        for row in reader:
            ticker = (row.get("ticker") or row.get("Ticker") or "").strip().upper()
            if not ticker:
                continue
            shares = float(row.get("shares") or row.get("Shares") or 0)
            cost = float(row.get("cost_basis") or row.get("Cost Basis") or row.get("cost") or 0)
            h = Holding(user_id=user_id, ticker=ticker, shares=shares, cost_basis=cost)
            session.add(h)
            imported.append({"ticker": ticker, "shares": shares})
        await session.commit()
    return {"imported": imported, "count": len(imported)}


@router.get("/portfolio/summary")
async def portfolio_summary(request: Request):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return await compute_portfolio_summary([])
    await require_pro_plan(request)
    require_db()
    async with AsyncSessionLocal() as session:
        stmt = select(Holding).where(Holding.user_id == user_id)
        rows = (await session.execute(stmt)).scalars().all()
        holdings = [
            {"ticker": h.ticker, "shares": h.shares, "cost_basis": h.cost_basis, "account_label": h.account_label}
            for h in rows
        ]
    return await compute_portfolio_summary(holdings)
