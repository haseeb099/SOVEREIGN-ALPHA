# Sovereign-Alpha: Quick Start

## Prerequisites
- Python 3.11+
- Docker Desktop (for Redis)
- Cerebras API key (cloud.cerebras.ai)

---

## Step 1: Environment Setup

```bash
cd sovereign-alpha
cp .env.example .env
# Edit .env and add your CEREBRAS_API_KEY
```

---

## Step 2: Start Redis

```bash
docker run -d -p 6379:6379 --name redis-sa redis:alpine
```

Or with Docker Compose:
```bash
docker-compose up redis -d
```

---

## Step 3: Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

---

## Step 4: Start Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Backend will be live at: http://localhost:8000
API docs at: http://localhost:8000/docs

---

## Step 5: Wire Frontend to Real APIs

Add this line to `frontend/index.html`, just before `</body>`:

```html
<script src="api-wiring.js"></script>
```

Then open `frontend/index.html` directly in your browser, OR the backend serves it at http://localhost:8000/

---

## Step 6: Test the Pipeline

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "TSLA",
    "scenario": {
      "margins": 18.5,
      "rates": 4.5,
      "regulatory": "Low",
      "sentiment": "Bullish"
    }
  }'
```

Expected: Full AI analysis response in 3-6 seconds.

---

## File Structure

```
sovereign-alpha/
├── .env.example             ← Copy to .env, add your keys
├── .cursor/rules/           ← Cursor AI coding rules
├── docker-compose.yml       ← Redis + backend orchestration
├── backend/
│   ├── main.py              ← FastAPI app (start here)
│   ├── requirements.txt     ← pip install -r requirements.txt
│   ├── agents/
│   │   └── pipeline.py      ← 5-agent Cerebras pipeline (CORE)
│   ├── routers/
│   │   ├── analyze.py       ← POST /api/analyze
│   │   ├── market.py        ← GET /api/market/{ticker}
│   │   ├── ingest.py        ← POST /api/ingest
│   │   ├── copilot.py       ← POST /api/copilot (streaming)
│   │   └── telemetry.py     ← WebSocket /ws/telemetry
│   └── services/
│       ├── market_service.py  ← yfinance + ccxt
│       ├── news_service.py    ← NewsAPI
│       └── ingest_service.py  ← PDF parsing
├── frontend/
│   ├── index.html           ← The prototype UI (DO NOT REWRITE)
│   └── api-wiring.js        ← Patches prototype to use real APIs
└── docs/
    └── HANDOFF.md           ← Full engineering handoff
```

---

## What to Tell Cursor

Once you have the backend running, paste this into Cursor chat:

> "I have a FastAPI backend at localhost:8000. The agent pipeline is in `backend/agents/pipeline.py` and uses Cerebras Gemma 4 31B. The frontend is `frontend/index.html`. Help me [specific task]."

---

## API Endpoints Reference

| Method | Path | What it does |
|---|---|---|
| GET | /health | Check backend status |
| GET | /api/market/{ticker} | Live price + volatility |
| GET | /api/market/{ticker}/news | Live news events |
| POST | /api/analyze | Run full 5-agent pipeline |
| POST | /api/ingest | Upload + parse a document |
| POST | /api/copilot | Streaming portfolio Q&A |
| WS | /ws/telemetry | Real-time agent log stream |

Interactive docs: http://localhost:8000/docs
