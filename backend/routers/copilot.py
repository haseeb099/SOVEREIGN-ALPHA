"""
/api/copilot — Portfolio Copilot streaming chat
Answers user questions about their portfolio using Gemma 4 with streaming.
"""
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from cerebras.cloud.sdk import AsyncCerebras

from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL

router = APIRouter()

COPILOT_SYSTEM_PROMPT = """You are the Portfolio Copilot on Sovereign-Alpha, an AI Investment Intelligence OS powered by Cerebras and Gemma 4 31B.

You are an expert investment analyst with deep knowledge of:
- Equity analysis (PE ratios, DCF, margin analysis)
- Macro economics (interest rates, inflation, currency dynamics)
- Risk management (VaR, hedging strategies, correlation)
- Crypto/DeFi asset dynamics
- Commodity markets (gold, oil)

Your role: Answer the user's portfolio question concisely and with institutional precision.
Keep answers under 200 words. Be specific, cite metrics where relevant, and always end with a concrete recommendation or observation.
Do NOT use markdown headers. Use plain prose."""


class CopilotRequest(BaseModel):
    query: str
    portfolio_context: Optional[dict] = None  # Current asset + scenario state from frontend


@router.post("/copilot")
async def portfolio_copilot(request: CopilotRequest):
    """
    Stream a portfolio analysis response from Gemma 4.
    Returns Server-Sent Events (SSE) for streaming UI.
    """
    if not CEREBRAS_API_KEY:
        raise HTTPException(status_code=503, detail="CEREBRAS_API_KEY not configured")

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Build context from portfolio state
    context_str = ""
    if request.portfolio_context:
        ctx = request.portfolio_context
        context_str = f"""
Current Portfolio Context:
- Active Asset: {ctx.get('ticker', 'Unknown')}
- Price: ${ctx.get('price', 0):,.2f} ({ctx.get('change_pct', 0):+.1f}%)
- Scenario: Margins={ctx.get('margins', 'N/A')}%, Rates={ctx.get('rates', 'N/A')}%, Sentiment={ctx.get('sentiment', 'N/A')}
- Current Rating: {ctx.get('rating', 'N/A')}
"""

    user_message = f"{context_str}\nUser Question: {request.query}"

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
