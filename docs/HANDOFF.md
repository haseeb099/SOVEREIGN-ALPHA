# SOVEREIGN-ALPHA: AI Investment Intelligence OS
## Complete Engineering Handoff Document

---

## 1. WHAT THIS PRODUCT IS

**Sovereign-Alpha** is a continuous investment intelligence cockpit. It replaces static analyst reports (PDFs, 10-Ks, memos) with a live, AI-audited "living thesis" that never goes stale.

Instead of a human analyst reading a Morgan Stanley note once and forgetting it, Sovereign-Alpha:
1. Ingests the document → extracts the core investment thesis assumptions
2. Continuously monitors live market data against those assumptions
3. Runs a multi-agent AI pipeline (on Cerebras + Gemma 4 31B) that debates the thesis from Bull, Bear, and Red Team perspectives
4. Surfaces a dynamically updated Strategic Intelligence Memo + Thesis Tracker

**Primary value**: Speed-of-insight. Cerebras WSE-3 runs Gemma 4 31B at ~1,650 tok/s — 10-15x faster than GPU inference. This means a full multi-agent thesis audit that takes 45 seconds on OpenAI takes under 5 seconds here.

---

## 2. WHAT EXISTS RIGHT NOW (THE PROTOTYPE)

### What is working in `frontend/index.html` (the uploaded file):
| Feature | Status | What it does |
|---|---|---|
| Asset switcher (TSLA, BTC, GOLD, EURUSD) | ✅ Working (mock) | Swaps the entire UI context for different assets |
| Scenario Simulator sliders | ✅ Working (mock) | Adjusts margins, rates, regulatory pressure — recalculates targets live |
| Thesis Tracker™ panel | ✅ Working (mock) | Shows 3 thesis points with PASS/RISK/FAIL badges |
| Strategic Intelligence Memo tab | ✅ Working (mock) | Renders a structured investment memo with bull/bear verdicts |
| Live Macro Event Feed | ✅ Working (mock) | Click events to inject into simulator (e.g., "Fed cuts 25bps") |
| Agent Telemetry log footer | ✅ Working (mock) | Streams fake log messages simulating agent pipeline |
| Portfolio Copilot chat | ✅ Working (mock) | Returns hardcoded text responses |
| Document drag-and-drop | ✅ Working (mock) | Simulates upload progress bar (no actual parsing) |

### What is NOT working (requires backend):
- Real market prices (using hardcoded values: TSLA=$185.20, BTC=$94,250)
- Real AI reasoning (all text is hardcoded strings, not Gemma 4 output)
- Actual document parsing (PDF/10-K ingestion is a fake progress bar)
- Real news feed (MOCK_EVENTS are static hardcoded scenarios)
- Portfolio Copilot (returns same canned response regardless of question)
- Persistence (no database, nothing saves between sessions)

---

## 3. THE MARKET PROBLEM WE SOLVE

### Current landscape pain points:
| Tool | What it does | Why it fails |
|---|---|---|
| Bloomberg Terminal | Live price data + news | $24,000/year. No AI reasoning. Data ≠ Insight |
| Koyfin / Tikr | Cheaper fundamental data | Still passive dashboards. No thesis tracking |
| ChatGPT / Perplexity | AI Q&A | No live market data. No persistent thesis. No speed |
| Seeking Alpha | Human analysts + alerts | Slow. Human-written. No adversarial red-teaming |
| Reflexivity / Finchat | AI on financials | No multi-agent debate. No continuous monitoring loop |

### The gap we fill:
> **No product today takes a human analyst's thesis document and continuously stress-tests it against live data in real-time using adversarial AI agents.**

Our differentiator: the **Thesis Tracker™** concept. An investment memo is not a one-time read — it's a set of falsifiable hypotheses. We track those hypotheses like integration tests against production data.

### How Cerebras gives us a moat:
- Full 5-agent pipeline runs in <5 seconds vs ~45s on GPT-4
- This enables "continuous monitoring" (run every 5 minutes) not "hourly batch jobs"
- The speed difference is qualitative — it changes what's possible in a live UI

---

## 4. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    USER BROWSER (Next.js)                   │
│  Sidebar: Asset Hub │ Center: Memo/Tracker/Copilot │ Right: Sim │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                   FastAPI Backend (Python)                   │
│                                                             │
│  /api/analyze     → Runs full agent pipeline                │
│  /api/market      → Fetches live prices + news              │
│  /api/ingest      → Parses PDF/10-K documents               │
│  /api/copilot     → Streams portfolio Q&A                   │
│  ws://telemetry   → Streams agent logs to frontend          │
└──────┬───────────────┬──────────────────┬───────────────────┘
       │               │                  │
┌──────▼──────┐ ┌──────▼──────┐ ┌────────▼────────┐
│  Cerebras   │ │  Market Data │ │   TimescaleDB   │
│  Gemma 4    │ │  yfinance/   │ │   + Redis Cache │
│  31B API    │ │  NewsAPI     │ │                 │
└─────────────┘ └─────────────┘ └─────────────────┘
```

### Agent Pipeline (runs on Cerebras):
```
Document/Asset → [1. VISION AGENT] → Extract thesis points
                       ↓
               [2. FUNDAMENTAL AGENT] → Analyze financial metrics
                       ↓
               [3. MACRO AGENT] → Cross-reference macro environment
                       ↓
               [4. BULL AGENT] → Build strongest bull case
                       ↓
               [5. RED TEAM AGENT] → Attack the bull case, find flaws
                       ↓
               [6. SYNTHESIS AGENT] → Final structured execution payload
```

---

## 5. TECH STACK

### Backend:
- **Python 3.11+** with FastAPI
- **Cerebras SDK** (`cerebras-cloud-sdk`) → Gemma 4 31B
- **yfinance** → free real-time stock prices
- **NewsAPI** → live news headlines ($0 free tier: 100 req/day)
- **PyMuPDF (fitz)** → PDF text extraction
- **Redis** → cache market data (TTL: 60s)
- **PostgreSQL / TimescaleDB** → store thesis history + audit trail
- **LangGraph** → agent orchestration DAG

### Frontend:
- **React 18 + TypeScript** (or keep as vanilla HTML for hackathon)
- **Tailwind CSS**
- **Recharts** → price charts
- **WebSocket** → telemetry log streaming

### Infrastructure:
- **Docker Compose** → local dev
- **Render / Railway** → deploy backend free tier

---

## 6. WHAT TO BUILD IN CURSOR (PRIORITY ORDER)

### Phase 1 — Wire Real Market Data (2 hours)
1. `backend/services/market_service.py` → fetch live prices via yfinance
2. `backend/routers/market.py` → `/api/market/{ticker}` endpoint
3. Update `frontend/index.html` → replace hardcoded prices with fetch calls

### Phase 2 — Wire Cerebras AI (3 hours)
1. `backend/agents/pipeline.py` → 5-agent LangGraph pipeline
2. `backend/routers/analyze.py` → `/api/analyze` endpoint (POST ticker + scenario)
3. Update frontend → Strategic Memo now shows real Gemma 4 output

### Phase 3 — Document Ingestion (2 hours)
1. `backend/services/ingest_service.py` → PDF → text → thesis point extraction
2. `backend/routers/ingest.py` → `/api/ingest` multipart upload endpoint
3. Update frontend → real upload, real thesis extraction

### Phase 4 — Streaming Telemetry (1 hour)
1. `backend/routers/telemetry.py` → WebSocket endpoint
2. Update frontend → connect telemetry log to real agent events

### Phase 5 — Portfolio Copilot (2 hours)
1. `backend/routers/copilot.py` → streaming chat with Gemma 4
2. Update frontend → real streaming responses to queries

---

## 7. ENVIRONMENT VARIABLES NEEDED

```bash
# backend/.env
CEREBRAS_API_KEY=your_cerebras_key_here        # Get from cerebras.ai
NEWS_API_KEY=your_newsapi_key_here             # Get from newsapi.org (free)
ALPHA_VANTAGE_KEY=your_av_key_here            # Optional, free fallback for FX
DATABASE_URL=postgresql://user:pass@localhost:5432/sovereign_alpha
REDIS_URL=redis://localhost:6379
```

---

## 8. JSON SCHEMA CONTRACT (Frontend ↔ Backend)

The frontend expects this exact payload from `/api/analyze`:

```json
{
  "ticker": "TSLA",
  "timestamp": "2026-06-28T10:00:00Z",
  "asset_price": 185.20,
  "asset_change_pct": 2.4,
  "volatility_30d": 38.4,
  "scenario": {
    "margins": 18.5,
    "rates": 4.5,
    "regulatory": "Low",
    "sentiment": "Bullish"
  },
  "memo": {
    "bull_verdict": "...",
    "bear_verdict": "...",
    "summary": "...",
    "price_target": 220.00,
    "confidence_band": [195, 245],
    "rating": "BULLISH"
  },
  "thesis_points": [
    {
      "id": 1,
      "text": "Operating margins remain structurally above 18%",
      "metric": "Margins",
      "status": "PASS",
      "current_value": "19.2%",
      "threshold": "18%"
    }
  ],
  "agent_logs": [
    {"agent": "FUNDAMENTAL", "message": "Analyzing Q4 margins...", "ts": 0.2},
    {"agent": "RED_TEAM", "message": "Challenging FSD timeline...", "ts": 1.1}
  ]
}
```

---

## 9. CEREBRAS API USAGE PATTERN

```python
from cerebras.cloud.sdk import Cerebras

client = Cerebras(api_key=os.environ["CEREBRAS_API_KEY"])

response = client.chat.completions.create(
    model="gemma2-31b-it",          # Gemma 4 31B on Cerebras
    messages=[
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        {"role": "user", "content": user_context}
    ],
    response_format={"type": "json_object"},  # Structured output
    max_tokens=1500,
    temperature=0.3,
)

result = json.loads(response.choices[0].message.content)
```

**Model string**: `gemma2-31b-it` (verify current string at cerebras.ai/docs)
**Expected throughput**: ~1,650 tok/s = full analysis in <3 seconds

---

## 10. HACKATHON DEMO SCRIPT

When showing the demo:
1. Open dashboard → TSLA loaded with live price
2. Upload a fake PDF (press the dropzone) → thesis points appear
3. Move "Operating Margins" slider DOWN → watch Thesis Tracker™ flip from PASS to RISK
4. Click "Fed cuts 25bps" event → system recalculates in real-time
5. Ask Portfolio Copilot: "What happens if Tesla misses earnings?" → Gemma 4 streams answer
6. Point at telemetry logs → "This is 5 agents coordinating in under 4 seconds on Cerebras hardware"

**Killer stat**: Full 5-agent pipeline at 1,650 tok/s vs GPT-4 at ~120 tok/s = 13.7x faster.

---

## 11. KNOWN ISSUES TO FIX

1. Price data for crypto (BTC, ETH) → use `ccxt` library, not yfinance
2. Gold (XAU) spot → use `yfinance` ticker `GC=F`
3. EURUSD → use `yfinance` ticker `EURUSD=X`
4. Rate limiting on free NewsAPI tier (100 req/day) → cache aggressively in Redis
5. The frontend's `switchAsset()` resets the scenario simulator — preserve user's slider values across asset switches
6. No error state handling in the UI — add skeleton loaders + error toasts

---

## 12. COMPETITIVE POSITIONING

| We say | Why it's true |
|---|---|
| "10-15x faster than ChatGPT analysis" | Cerebras 1,650 tok/s vs OpenAI ~120 tok/s |
| "Living thesis, not dead document" | Thesis Tracker™ monitors assumptions continuously |
| "Adversarial intelligence" | Red Team Agent actively attacks the bull case |
| "Bloomberg for AI-native investors" | Terminal aesthetic, institutional data, AI reasoning |

---

*Last updated: June 2026 | Engineer: Muhammad Haseeb Rafique*
