# Sovereign-Alpha

**The AI investment intelligence OS that turns static analyst memos into living, continuously stress-tested theses.**

[![CI](https://github.com/haseeb099/SOVEREIGN-ALPHA/actions/workflows/ci.yml/badge.svg)](https://github.com/haseeb099/SOVEREIGN-ALPHA/actions/workflows/ci.yml)

---

## Pitch

Investment research today is **slow, static, and siloed**. Bloomberg gives you data — not reasoning. ChatGPT gives you reasoning — but no live market context, no persistent thesis, and no adversarial challenge. Analyst PDFs go stale the moment they are published.

**Sovereign-Alpha closes that gap.**

We ingest your thesis documents (10-Ks, research memos, pitch decks), extract falsifiable assumptions, and run a **five-agent AI pipeline** — Fundamental, Macro, Bull, Red Team, and Synthesis — against **live market data** in under five seconds. The result is a Bloomberg-grade terminal where every investment memo is a **living thesis** with PASS / RISK / FAIL tracking, scenario simulation, and real-time agent telemetry.

> **No product today takes a human analyst's thesis and continuously stress-tests it against live data using adversarial AI agents. We do.**

### Why we win

| Differentiator | What it means |
|----------------|---------------|
| **Thesis Tracker™** | Investment memos become falsifiable hypotheses monitored like integration tests against production market data |
| **Multi-agent red-teaming** | Bull and Red Team agents debate every thesis — not a single LLM echo chamber |
| **Sub-5s inference** | Cerebras WSE-3 + Gemma 4 31B at ~1,650 tok/s enables continuous monitoring, not hourly batch jobs |
| **Full-stack cockpit** | Terminal UI, portfolio copilot, scenario simulator, document library, alerts, and shareable reports in one platform |
| **Production-ready architecture** | Next.js 15 + FastAPI monorepo, PostgreSQL persistence, Redis caching, Clerk auth, Vercel + Render deployment |

### The problem we solve

| Incumbent | Limitation |
|-----------|------------|
| Bloomberg Terminal | $24K/year — data without AI reasoning |
| Koyfin / Tikr | Passive dashboards — no thesis tracking |
| ChatGPT / Perplexity | No live prices, no persistent thesis, no speed |
| Seeking Alpha | Human-written, slow, no adversarial red-teaming |
| Finchat / Reflexivity | Single-agent AI — no continuous monitoring loop |

**Sovereign-Alpha** is the first platform built for **speed-of-insight**: the velocity to re-audit a thesis every time the market moves.

---

## Project overview

Sovereign-Alpha is a full-stack **AI Investment Intelligence OS** delivered as a pnpm monorepo:

- **`apps/web`** — Next.js 15 terminal UI with memo, thesis tracker, scenario simulator, portfolio copilot, compare, library, and alerts
- **`backend`** — FastAPI API with a five-agent Cerebras pipeline, Polygon/yfinance/ccxt market data, PDF ingestion, PostgreSQL + Redis, and WebSocket telemetry
- **`packages/shared`** — Shared TypeScript types and utilities across the monorepo

### Core capabilities

- **Multi-agent analysis** — Sequential pipeline: Fundamental → Macro → Bull → Red Team → Synthesis
- **Live market intelligence** — Real-time quotes via Polygon.io with yfinance/ccxt fallback; news via NewsAPI
- **Document ingestion** — Upload PDFs and research memos; extract thesis assumptions for tracking
- **Scenario simulator** — Stress-test margins, rates, and regulatory pressure with live target recalculation
- **Portfolio copilot** — Streaming Q&A grounded in holdings and thesis context
- **Sovereign Score** — Composite conviction signal across agent outputs
- **Watchlists & alerts** — Rule-based monitoring with notification hooks
- **Shareable reports** — Tokenized intelligence memos for stakeholders

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Next.js Terminal (apps/web)                    │
│  Memo │ Thesis Tracker │ Copilot │ Scenario │ Portfolio     │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                   FastAPI Backend (Python)                   │
│  /api/analyze  /api/market  /api/ingest  /api/copilot       │
│  /api/portfolio  /api/scenario  /api/alerts  ws://telemetry │
└──────┬───────────────┬──────────────────┬───────────────────┘
       │               │                  │
┌──────▼──────┐ ┌──────▼──────┐ ┌────────▼────────┐
│  Cerebras   │ │ Market Data  │ │ Postgres + Redis │
│  Gemma 4    │ │ Polygon /    │ │ persistence +    │
│  31B        │ │ yfinance     │ │ cache            │
└─────────────┘ └─────────────┘ └─────────────────┘
```

### Tech stack

| Layer | Technologies |
|-------|--------------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4, shadcn/ui, Clerk |
| Backend | Python 3.12, FastAPI, Pydantic v2, Alembic, SlowAPI |
| AI | Cerebras Cloud SDK, Gemma 4 31B, structured JSON agents |
| Data | PostgreSQL, Redis, Polygon.io, yfinance, ccxt, NewsAPI |
| Deploy | Vercel (web), Render (API), Docker Compose (local) |

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22+ | Next.js frontend |
| pnpm | 10+ (`packageManager` in root `package.json`) | Monorepo installs |
| Python | 3.11 or 3.12 | FastAPI backend (CI uses 3.12; avoid 3.13 if native wheels fail) |
| Docker Desktop | Latest | Redis, Postgres, optional full stack |

Optional: Cerebras API key, Polygon/NewsAPI keys, Clerk keys for auth in staging/production.

## Repository layout

```
apps/web/          Next.js 15 app (@sovereign/web)
backend/           FastAPI API, agents, Alembic migrations
packages/shared/   Shared types and utilities
frontend-legacy/   Static prototype (reference only)
```

## Local development setup

### 1. Clone and configure environment

```bash
git clone https://github.com/haseeb099/SOVEREIGN-ALPHA.git
cd SOVEREIGN-ALPHA
cp .env.example .env
```

Edit `.env` at the **repo root** (backend loads `../.env` from `backend/`). Minimum for local analysis: `CEREBRAS_API_KEY`. For Docker Compose, keep `DATABASE_URL` and `REDIS_URL` aligned with the table below.

### 2. Environment variables

| Variable | Required | Default (local) | Description |
|----------|----------|-----------------|-------------|
| `CEREBRAS_API_KEY` | Yes (prod) | — | Cerebras inference API key |
| `CEREBRAS_MODEL` | No | `gemma-4-31b` | Model id for the pipeline |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Cache and rate-limit storage |
| `DATABASE_URL` | Yes | `postgresql://sovereign:sovereign@localhost:5433/sovereign_alpha` | Postgres (async via asyncpg) |
| `POLYGON_API_KEY` | No | — | Polygon.io REST API (live quotes); falls back to yfinance/ccxt |
| `POLYGON_BASE_URL` | No | `https://api.polygon.io` | Polygon API base URL |
| `MASSIVE_S3_ACCESS_KEY_ID` | No | — | Massive.com flat files S3 access key (bulk historical CSV) |
| `MASSIVE_S3_SECRET_ACCESS_KEY` | No | — | Massive.com flat files S3 secret key |
| `MASSIVE_S3_ENDPOINT` | No | `https://files.massive.com` | Massive S3 endpoint |
| `MASSIVE_S3_BUCKET` | No | `flatfiles` | Massive flat files bucket |
| `NEWS_API_KEY` | No | — | NewsAPI headlines |
| `ALPHA_VANTAGE_KEY` | No | — | Optional fundamentals fallback |
| `MARKET_CACHE_TTL_EQUITY` | No | `15` | Equity quote cache TTL (seconds) |
| `MARKET_CACHE_TTL_CRYPTO` | No | `5` | Crypto quote cache TTL (seconds) |
| `CLERK_SECRET_KEY` | No | — | Clerk backend secret |
| `CLERK_JWKS_URL` | No | — | JWKS URL (or set `CLERK_ISSUER`) |
| `CLERK_ISSUER` | No | — | Clerk issuer URL for JWT verification |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | No | — | Clerk publishable key (web) |
| `RESEND_API_KEY` | No | — | Report email delivery |
| `SENTRY_DSN` | No | — | Error tracking (API) |
| `ENVIRONMENT` | No | `development` | `development` / `production` |
| `LOG_LEVEL` | No | `INFO` | Python log level |
| `ALLOWED_ORIGINS` | Prod | dev localhost list | Comma-separated CORS origins |
| `RATE_LIMIT_DEFAULT` | No | `120/minute` | SlowAPI default limit |
| `DEMO_API_KEY` | No | `demo-sovereign-key` | Public API demo key |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:8000` | Browser API base URL |
| `NEXT_PUBLIC_WS_URL` | No | `ws://localhost:8000` | WebSocket base URL |

### 3. Infrastructure with Docker Compose

Start Redis, Postgres, and the API (reads root `.env`):

```bash
docker compose up -d
```

| Service | Host port | Health |
|---------|-----------|--------|
| `redis` | 6379 | `redis-cli ping` |
| `postgres` | 5433 → 5432 | `pg_isready` |
| `backend` | 8000 | `GET /health` |

Redis/Postgres only:

```bash
docker compose up -d redis postgres
```

### 4. Install dependencies

```bash
pnpm install
cd backend && pip install -r requirements-dev.txt
```

### 5. Run dev servers (two terminals)

**API**

```bash
pnpm dev:api
```

- API: http://localhost:8000  
- OpenAPI: http://localhost:8000/docs  

**Web**

```bash
pnpm dev
```

- UI: http://localhost:3000  

Or run both at once:

```bash
pnpm dev:all
```

### 6. Quality checks (matches CI)

```bash
cd backend && python -m pytest -q
cd .. && pnpm typecheck && pnpm lint && pnpm build
```

## Deployment notes

| Target | App | Config |
|--------|-----|--------|
| **Vercel** | `apps/web` | Root `vercel.json`: `pnpm install`, `pnpm --filter @sovereign/web build`, output `apps/web/.next`. Set `NEXT_PUBLIC_*` and Clerk vars in the Vercel project. |
| **Render** | `backend` | `render.yaml` blueprint: Docker API (`backend/Dockerfile`, context repo root), managed Postgres + Redis. Set secrets (`CEREBRAS_API_KEY`, `ALLOWED_ORIGINS`, etc.) in the dashboard. |

Point production `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` at the Render API URL. Set `ALLOWED_ORIGINS` to your Vercel domain(s).

### Production checklist

| Step | Action |
|------|--------|
| 1 | Set `CEREBRAS_API_KEY` on Render (required for analyze/copilot) |
| 2 | Set `ALLOWED_ORIGINS=https://your-app.vercel.app` on Render (exact origin, no wildcard) |
| 3 | Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` on Vercel to Render API URL |
| 4 | Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + Clerk secrets for auth-gated features |
| 5 | Verify CORS: `curl -X OPTIONS -H "Origin: https://your-app.vercel.app" -H "Access-Control-Request-Method: GET" https://api.example.com/api/market/assets/list -v` |

**Recommended local dev flow** (API on host, not in Docker):

```bash
docker compose up -d redis postgres
pnpm dev:api   # terminal 1
pnpm dev       # terminal 2
```

Full Docker stack (`docker compose up -d`) uses container networking for Redis/Postgres automatically.

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Status and subsystem checks |
| GET | `/api/market/{ticker}` | Live price and volatility |
| GET | `/api/market/{ticker}/news` | News events |
| POST | `/api/analyze` | Five-agent analysis pipeline |
| POST | `/api/ingest` | Document upload and parse |
| POST | `/api/copilot` | Streaming portfolio Q&A |
| WS | `/ws/telemetry` | Agent log stream |

Interactive docs: http://localhost:8000/docs

## Frontend routes → API

| UI route | Primary API paths |
|----------|-------------------|
| `/terminal/*` | `POST /api/analyze`, `POST /api/scenario/preview`, `GET /api/market/*` |
| `/portfolio` | `/api/portfolio/holdings`, `/api/portfolio/import` |
| `/compare` | `POST /api/analyze/batch` |
| `/library` | `GET /api/library` |
| `/settings` | `/api/alerts/rules` |
| `/reports/[token]` | `GET /api/reports/{share_token}` |

## Additional documentation

See `docs/HANDOFF.md` for engineering handoff and agent pipeline details.
