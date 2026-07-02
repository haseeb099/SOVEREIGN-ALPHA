#!/usr/bin/env python3
"""Generate beta invite codes and optionally approve pending applications."""
from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))


def _code() -> str:
    return f"SA-{secrets.token_hex(4).upper()}"


async def generate(count: int, approve: bool) -> None:
    from sqlalchemy import select

    from database import AsyncSessionLocal, init_db
    from models import BetaApplication

    await init_db()
    codes: list[str] = []
    async with AsyncSessionLocal() as session:
        pending = (
            await session.execute(
                select(BetaApplication)
                .where(BetaApplication.status == "pending")
                .order_by(BetaApplication.created_at)
                .limit(count)
            )
        ).scalars().all()
        for app in pending:
            app.invite_code = _code()
            if approve:
                app.status = "approved"
            codes.append(f"{app.email}\t{app.invite_code}")
        remaining = count - len(pending)
        for _ in range(max(0, remaining)):
            code = _code()
            session.add(
                BetaApplication(
                    email=f"invite-{code.lower()}@beta.sovereign-alpha.local",
                    name="Reserved invite",
                    status="approved" if approve else "pending",
                    invite_code=code,
                )
            )
            codes.append(f"(reserved)\t{code}")
        await session.commit()
    print(f"Generated {len(codes)} invite codes:")
    for line in codes:
        print(line)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate beta invite codes")
    parser.add_argument("-n", "--count", type=int, default=20, help="Number of invites")
    parser.add_argument("--approve", action="store_true", help="Mark applications approved")
    args = parser.parse_args()
    asyncio.run(generate(args.count, args.approve))
