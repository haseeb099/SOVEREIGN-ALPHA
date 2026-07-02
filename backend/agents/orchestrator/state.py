"""TypedDict state definitions for LangGraph orchestrator."""
from __future__ import annotations

from typing import Any, Callable, Optional, TypedDict


class AnalysisState(TypedDict, total=False):
    ticker: str
    market_data: dict
    scenario: dict
    thesis_points: Optional[list]
    retrieved_chunks: list
    retrieved_sources: str
    prior_analyses: str
    context: str
    client: Any
    on_log: Optional[Callable]
    start_time: float
    valid_chunk_ids: set
    has_market: bool
    results: dict
    agent_timings: dict
    pipeline_audit: list
    elapsed: float
    pipeline_result: dict
    enable_research: bool
    research_brief: str
    research_results: dict
    research_traces: list
    research_timings: dict
    red_team_signals: dict
    enable_research: bool
    research_brief: str
    research_results: dict
    research_traces: list
    research_tool_outputs: dict
    red_team_signals: dict


class WorkflowState(TypedDict, total=False):
    workflow_id: str
    user_id: Optional[str]
    goal: str
    ticker: str
    scenario: dict
    plan: dict
    auto_approve: bool
    status: str
    pending_checkpoint: Optional[dict]
    retrieved_chunks: list
    retrieved_sources: str
    prior_analyses: str
    thesis_points: Optional[list]
    market_data: dict
    analysis_result: dict
    verification: dict
    report_id: Optional[str]
    error: Optional[str]
    tool_outputs: list
