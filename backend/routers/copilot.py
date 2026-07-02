"""
/api/copilot — Portfolio Copilot streaming chat
Answers user questions about their portfolio using Gemma 4 with streaming.
"""
import json
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from cerebras.cloud.sdk import AsyncCerebras

from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL
from services.plan_service import require_pro_plan
from services.retrieval_service import format_retrieved_sources, retrieve

router = APIRouter()

COPILOT_SYSTEM_PROMPT = """You are the Portfolio Copilot on Sovereign-Alpha, an AI Investment Intelligence OS powered by Cerebras and Gemma 4 31B.

You are an expert investment analyst with deep knowledge of:
- Equity analysis (PE ratios, DCF, margin analysis)
- Macro economics (interest rates, inflation, currency dynamics)
- Risk management (VaR, hedging strategies, correlation)
- Crypto/DeFi asset dynamics
- Commodity markets (gold, oil)

Your role: Answer the user's portfolio question concisely and with institutional precision.
Only cite facts from RETRIEVED_SOURCES or portfolio context — do not invent metrics.
Keep answers under 200 words. Be specific, cite metrics where relevant, and always end with a concrete recommendation or observation.
Do NOT use markdown headers. Use plain prose."""


class CopilotRequest(BaseModel):
    query: str
    portfolio_context: Optional[dict] = None  # Current asset + scenario state from frontend


@router.post("/copilot")
async def portfolio_copilot(http_request: Request, request: CopilotRequest):
    await require_pro_plan(http_request)
    """
    Stream a portfolio analysis response from Gemma 4.
    Returns Server-Sent Events (SSE) for streaming UI.
    """
    if not CEREBRAS_API_KEY:
        raise HTTPException(status_code=503, detail="CEREBRAS_API_KEY not configured")

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    context_str = ""
    ticker = "UNKNOWN"
    if request.portfolio_context:
        ctx = request.portfolio_context
        ticker = str(ctx.get("ticker") or "UNKNOWN").upper()
        holdings = ctx.get("holdings") or []
        holdings_count = len(holdings) if isinstance(holdings, list) else 0
        total_value = ctx.get("total_value", 0)
        context_str = f"""
Current Portfolio Context:
- Active Asset: {ticker}
- Price: ${ctx.get('price', 0):,.2f} ({ctx.get('change_pct', 0):+.1f}%)
- Scenario: Margins={ctx.get('margins', 'N/A')}%, Rates={ctx.get('rates', 'N/A')}%, Sentiment={ctx.get('sentiment', 'N/A')}
- Current Rating: {ctx.get('rating', 'N/A')}
- Portfolio Holdings: {holdings_count} position(s), total value ${float(total_value or 0):,.2f}
"""
        if holdings_count > 0 and isinstance(holdings, list):
            top = holdings[:5]
            lines = []
            for h in top:
                if isinstance(h, dict):
                    lines.append(
                        f"  - {h.get('ticker', '?')}: {h.get('shares', '?')} shares"
                    )
            if lines:
                context_str += "Top holdings:\n" + "\n".join(lines) + "\n"

    retrieved = await retrieve(
        ticker=ticker,
        query=request.query,
        filters={"source_types": ["document", "market", "filing"]},
        top_k=6,
    )
    sources_block = format_retrieved_sources(retrieved)
    data_citations = [
        {
            "chunk_id": c.get("chunk_id"),
            "source_type": c.get("source_type"),
            "source_label": c.get("source_label"),
            "source_date": c.get("source_date"),
            "data_point": c.get("chunk_text", "")[:200],
        }
        for c in retrieved
    ]

    user_message = f"{context_str}\n{sources_block}\nUser Question: {request.query}"

    async def stream_response():
        try:
            client = AsyncCerebras(api_key=CEREBRAS_API_KEY)

            stream = await client.chat.completions.create(
                model=CEREBRAS_MODEL,
                messages=[
                    {"role": "system", "content": COPILOT_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=400,
                temperature=0.4,
                stream=True,
            )

            async for chunk in stream:
                content = chunk.choices[0].delta.content or ""
                if content:
                    yield f"data: {json.dumps({'delta': content})}\n\n"

            yield f"data: {json.dumps({'metadata': {'data_citations': data_citations}})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )
