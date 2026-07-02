"""
Multi-Agent Analysis Pipeline
Thin backward-compatible wrapper delegating to LangGraph analysis subgraph.
"""
from typing import Callable, Optional

from agents.base import (
    MIN_RETRIEVED_CHUNKS,
    _CITATION_FIELDS,
    _apply_insufficient_data_rule,
    _call_agent,
    _default_citation,
    build_agent_trace,
    derive_rating,
    validate_citations,
)
from agents.orchestrator.graph import run_analysis_graph
from cerebras_config import CEREBRAS_API_KEY

# Re-export prompts for any legacy imports
from agents.fundamental_agent import SYSTEM_PROMPT as FUNDAMENTAL_PROMPT
from agents.macro_agent import SYSTEM_PROMPT as MACRO_PROMPT
from agents.bull_agent import SYSTEM_PROMPT as BULL_PROMPT
from agents.red_team_agent import SYSTEM_PROMPT as RED_TEAM_PROMPT
from agents.synthesis_agent import SYSTEM_PROMPT as SYNTHESIS_PROMPT


async def run_analysis_pipeline(
    ticker: str,
    market_data: dict,
    scenario: dict,
    thesis_points: Optional[list] = None,
    on_log: Optional[Callable] = None,
    retrieved_chunks: Optional[list] = None,
    retrieved_sources: Optional[str] = None,
    enable_research: bool = True,
) -> dict:
    """
    Run the full 5-agent pipeline and return a structured analysis payload.
    Delegates to the compiled LangGraph analysis subgraph (with optional research pre-pass).
    """
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY not set in environment")

    return await run_analysis_graph(
        ticker=ticker,
        market_data=market_data,
        scenario=scenario,
        thesis_points=thesis_points,
        on_log=on_log,
        retrieved_chunks=retrieved_chunks,
        retrieved_sources=retrieved_sources,
        enable_research=enable_research,
    )
