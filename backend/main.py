"""
Sovereign-Alpha: AI Investment Intelligence OS
FastAPI Backend Entry Point
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

_sentry_dsn = os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(dsn=_sentry_dsn, integrations=[FastApiIntegration()], traces_sample_rate=0.1)
    except Exception:
        pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from cerebras_config import CEREBRAS_MODEL
from cors_config import get_allowed_origins
from database import init_db
from middleware.auth import AuthMiddleware
from middleware.logging_middleware import StructuredLoggingMiddleware
from middleware.rate_limit import limiter
from middleware.request_id import RequestIdMiddleware
from routers import (
    analyze,
    market,
    ingest,
    copilot,
    telemetry,
    history,
    scenario,
    portfolio,
    watchlists,
    alerts,
    reports,
    library,
    public_v1,
)
from services.health_service import build_health_payload


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Database init skipped: %s", e)
    yield


app = FastAPI(
    title="Sovereign-Alpha API",
    description="AI Investment Intelligence OS — Powered by Cerebras + Gemma 4 31B",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(StructuredLoggingMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api")
app.include_router(market.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(copilot.router, prefix="/api")
app.include_router(telemetry.router)
app.include_router(history.router, prefix="/api")
app.include_router(scenario.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(watchlists.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(library.router, prefix="/api")
app.include_router(public_v1.router, prefix="/api")


@app.get("/health")
async def health():
    payload = await build_health_payload()
    return payload


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
