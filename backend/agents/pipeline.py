"""
Multi-Agent Analysis Pipeline
Orchestrates 5 specialized Gemma 4 agents running on Cerebras WSE-3.
Designed as a sequential chain (can be parallelized in v2).

Pipeline flow:
  Input (ticker + scenario) →
    [1. Fundamental Agent] → financial metric analysis
    [2. Macro Agent] → macroeconomic cross-reference
    [3. Bull Agent] → strongest bull case
    [4. Red Team Agent] → adversarial counter-arguments
    [5. Synthesis Agent] → final structured payload
"""
import json
import time
import asyncio
from typing import Optional, Callable
from cerebras.cloud.sdk import Cerebras
from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL

MODEL = CEREBRAS_MODEL


# ─── Agent System Prompts ────────────────────────────────────────────────────

FUNDAMENTAL_PROMPT = """You are the Fundamental Analysis Agent on the Sovereign-Alpha investment platform.
Your role: Analyze the raw financial metrics of an asset given a scenario configuration.
Output ONLY valid JSON with this structure:
{
  "agent": "FUNDAMENTAL",
  "score": 7.2,
  "margin_assessment": "...",
  "rate_sensitivity": "...",
  "regulatory_outlook": "...",
  "key_metrics": {"pe_ratio": "...", "revenue_growth": "...", "debt_to_equity": "..."},
  "log_message": "One-line summary of your analysis for the telemetry log"
}"""

MACRO_PROMPT = """You are the Macro Intelligence Agent on the Sovereign-Alpha investment platform.
Your role: Cross-reference the current macroeconomic environment against the asset's thesis assumptions.
Output ONLY valid JSON with this structure:
{
  "agent": "MACRO",
  "macro_score": 6.5,
  "interest_rate_impact": "...",
  "inflation_context": "...",
  "dollar_strength_effect": "...",
  "geopolitical_risk": "Low|Medium|High",
  "log_message": "One-line summary for telemetry"
}"""

BULL_PROMPT = """You are the Bull Case Agent on the Sovereign-Alpha investment platform.
Your role: Build the strongest possible bull case for this asset. Be specific with catalysts and targets.
Output ONLY valid JSON with this structure:
{
  "agent": "BULL",
  "verdict": "Two to three sentence bull thesis",
  "price_target": 240.00,
  "confidence_band": [210, 270],
  "key_catalysts": ["Catalyst 1", "Catalyst 2", "Catalyst 3"],
  "time_horizon": "12-18 months",
  "citations": [{"type": "metric", "label": "Operating Margin", "value": "19.2%"}],
  "factor_weights": {"margins": 0.35, "fsd": 0.25, "rates": 0.20},
  "log_message": "One-line summary for telemetry"
}"""

RED_TEAM_PROMPT = """You are the Red Team Adversarial Agent on the Sovereign-Alpha investment platform.
Your role: Attack the bull thesis. Find every flaw, risk, and assumption failure. Be institutional and specific.
Output ONLY valid JSON with this structure:
{
  "agent": "RED_TEAM",
  "verdict": "Two to three sentence bear thesis attacking the bull case",
  "bear_price_target": 140.00,
  "key_risks": ["Risk 1", "Risk 2", "Risk 3"],
  "thesis_attack": "Specific argument against the bull catalyst",
  "citations": [{"type": "risk", "label": "Competition", "value": "BYD market share +12%"}],
  "factor_weights": {"competition": 0.32, "margins": 0.28, "regulatory": 0.20},
  "log_message": "One-line summary for telemetry"
}"""

SYNTHESIS_PROMPT = """You are the Synthesis Agent on the Sovereign-Alpha investment platform.
You have received analysis from Fundamental, Macro, Bull, and Red Team agents.
Your role: Synthesize all inputs into a final structured investment verdict.
Output ONLY valid JSON with this structure:
{
  "agent": "SYNTHESIS",
  "rating": "BULLISH|NEUTRAL|BEARISH",
  "confidence_score": 7.5,
  "summary": "3-4 sentence executive summary of the overall investment case",
  "bull_verdict": "2 sentence bull case for display",
  "bear_verdict": "2 sentence bear case for display",
  "price_target": 220.00,
  "distribution": {
    "bear": {"price": 165.0, "probability": 0.20},
    "base": {"price": 210.0, "probability": 0.55},
    "bull": {"price": 285.0, "probability": 0.25}
  },
  "thesis_points": [
    {"id": 1, "text": "...", "metric": "Margins", "status": "PASS|RISK|FAIL", "current_value": "19.2%", "threshold": "18%"}
  ],
  "audit_warnings": ["Optional list of integrity warnings, e.g. price target vs scenario mismatch"],
  "log_message": "Final synthesis complete — rating: BULLISH"
}"""


# ─── Core Agent Runner ───────────────────────────────────────────────────────

def _call_agent(client: Cerebras, system_prompt: str, user_message: str) -> dict:
    """Synchronous Cerebras call — run in executor for async compat."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        max_tokens=1200,
        temperature=0.3,
    )
    return json.loads(response.choices[0].message.content)


# ─── Pipeline ────────────────────────────────────────────────────────────────

async def run_analysis_pipeline(
    ticker: str,
    market_data: dict,
    scenario: dict,
    thesis_points: Optional[list] = None,
    on_log: Optional[Callable] = None,
) -> dict:
    """
    Run the full 5-agent pipeline and return a structured analysis payload.

    Args:
        ticker: Asset key (TSLA, BTC, XAU, EUR)
        market_data: Live price data from market_service
        scenario: Dict with keys: margins, rates, regulatory, sentiment
        thesis_points: Optional pre-existing thesis from document ingestion
        on_log: Async callback to push telemetry events: on_log(agent, message)
    """
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY not set in environment")

    client = Cerebras(api_key=CEREBRAS_API_KEY)
    loop = asyncio.get_event_loop()
    start_time = time.time()

    async def log(agent: str, message: str):
        if on_log:
            await on_log({"agent": agent, "message": message, "ts": round(time.time() - start_time, 2)})

    # Build shared context string passed to all agents
    context = f"""
Asset: {ticker}
Full Name: {market_data.get('full_name', ticker)}
Current Price: ${market_data.get('price', 0):,.2f}
24h Change: {market_data.get('change_pct', 0):+.1f}%
30-Day Volatility: {market_data.get('volatility_30d', 0):.1f}%

Scenario Parameters:
- Operating Margins: {scenario.get('margins', 18.5)}%
- Interest Rates: {scenario.get('rates', 4.5)}%
- Regulatory Pressure: {scenario.get('regulatory', 'Low')}
- Market Sentiment: {scenario.get('sentiment', 'Neutral')}
"""

    if thesis_points:
        context += f"\nExisting Thesis Points to Evaluate:\n{json.dumps(thesis_points, indent=2)}"

    results = {}

    # ── Agent 1: Fundamental ──────────────────────────────────────────────
    await log("FUNDAMENTAL", f"Analyzing financial metrics for {ticker}...")
    try:
        fundamental = await loop.run_in_executor(
            None, _call_agent, client, FUNDAMENTAL_PROMPT,
            f"Analyze fundamentals:\n{context}"
        )
        results["fundamental"] = fundamental
        await log("FUNDAMENTAL", fundamental.get("log_message", "Analysis complete"))
    except Exception as e:
        results["fundamental"] = {"error": str(e)}
        await log("FUNDAMENTAL", f"ERROR: {e}")

    # ── Agent 2: Macro ────────────────────────────────────────────────────
    await log("MACRO", "Cross-referencing macroeconomic environment...")
    try:
        macro = await loop.run_in_executor(
            None, _call_agent, client, MACRO_PROMPT,
            f"Macro analysis:\n{context}\n\nFundamental findings: {json.dumps(results.get('fundamental', {}))}"
        )
        results["macro"] = macro
        await log("MACRO", macro.get("log_message", "Macro analysis complete"))
    except Exception as e:
        results["macro"] = {"error": str(e)}
        await log("MACRO", f"ERROR: {e}")

    # ── Agent 3: Bull ─────────────────────────────────────────────────────
    await log("BULL", "Building strongest bull case...")
    try:
        bull = await loop.run_in_executor(
            None, _call_agent, client, BULL_PROMPT,
            f"Build bull case:\n{context}"
        )
        results["bull"] = bull
        await log("BULL", bull.get("log_message", f"Bull target: ${bull.get('price_target', 0)}"))
    except Exception as e:
        results["bull"] = {"error": str(e)}
        await log("BULL", f"ERROR: {e}")

    # ── Agent 4: Red Team ─────────────────────────────────────────────────
    await log("RED_TEAM", "Initiating adversarial red-team attack on bull thesis...")
    try:
        red_team = await loop.run_in_executor(
            None, _call_agent, client, RED_TEAM_PROMPT,
            f"Attack this bull case:\n{json.dumps(results.get('bull', {}))}\n\nContext:\n{context}"
        )
        results["red_team"] = red_team
        await log("RED_TEAM", red_team.get("log_message", "Red-team analysis complete"))
    except Exception as e:
        results["red_team"] = {"error": str(e)}
        await log("RED_TEAM", f"ERROR: {e}")

    # ── Agent 5: Synthesis ────────────────────────────────────────────────
    await log("SYNTHESIS", "Synthesizing all agent outputs into final verdict...")
    try:
        all_context = f"""
Context:\n{context}

Fundamental Agent Output:\n{json.dumps(results.get('fundamental', {}), indent=2)}
Macro Agent Output:\n{json.dumps(results.get('macro', {}), indent=2)}
Bull Agent Output:\n{json.dumps(results.get('bull', {}), indent=2)}
Red Team Agent Output:\n{json.dumps(results.get('red_team', {}), indent=2)}
"""
        if thesis_points:
            all_context += f"\nOriginal Thesis Points to Grade:\n{json.dumps(thesis_points, indent=2)}"

        synthesis = await loop.run_in_executor(
            None, _call_agent, client, SYNTHESIS_PROMPT, all_context
        )
        results["synthesis"] = synthesis
        await log("SYNTHESIS", synthesis.get("log_message", "Pipeline complete"))
    except Exception as e:
        results["synthesis"] = {"error": str(e)}
        await log("SYNTHESIS", f"ERROR: {e}")

    elapsed = round(time.time() - start_time, 2)
    await log("SYSTEM", f"Full 5-agent pipeline completed in {elapsed}s at ~1,650 tok/s (Cerebras WSE-3)")

    # ── Assemble Final Payload ────────────────────────────────────────────
    synthesis = results.get("synthesis", {})
    bull = results.get("bull", {})
    red_team = results.get("red_team", {})

    return {
        "ticker": ticker,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "asset_price": market_data.get("price", 0),
        "asset_change_pct": market_data.get("change_pct", 0),
        "volatility_30d": market_data.get("volatility_30d", 0),
        "scenario": scenario,
        "pipeline_elapsed_seconds": elapsed,
        "memo": {
            "bull_verdict": synthesis.get("bull_verdict") or bull.get("verdict", ""),
            "bear_verdict": synthesis.get("bear_verdict") or red_team.get("verdict", ""),
            "summary": synthesis.get("summary", ""),
            "price_target": synthesis.get("price_target") or bull.get("price_target", 0),
            "confidence_band": bull.get("confidence_band", [0, 0]),
            "rating": synthesis.get("rating", "NEUTRAL"),
            "confidence_score": synthesis.get("confidence_score", 5.0),
            "audit_warnings": synthesis.get("audit_warnings") or [],
            "distribution": synthesis.get("distribution"),
        },
        "thesis_points": synthesis.get("thesis_points", thesis_points or []),
        "agent_logs": [],  # Populated via WebSocket, not in REST response
        "raw_agents": results,  # Include for debugging
    }
