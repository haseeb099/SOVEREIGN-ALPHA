"""
Sovereign-Alpha: AI Investment Intelligence OS
FastAPI Backend Entry Point
"""
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from cerebras_config import CEREBRAS_MODEL
from cors_config import get_allowed_origins
from database import init_db
from routers import analyze, market, ingest, copilot, telemetry, history


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

# CORS — explicit origins only (see ALLOWED_ORIGINS in .env)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(analyze.router, prefix="/api")
app.include_router(market.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(copilot.router, prefix="/api")
app.include_router(telemetry.router)
app.include_router(history.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "online", "model": CEREBRAS_MODEL, "provider": "cerebras"}


# Serve frontend static files (mount last so /health and /api/* take precedence)
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
