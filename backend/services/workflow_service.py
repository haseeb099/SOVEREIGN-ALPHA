"""Workflow run persistence, checkpoint detection, and response shaping."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from database import AsyncSessionLocal
from models import WorkflowRun

logger = logging.getLogger(__name__)

CHECKPOINT_SUMMARIES = {
    "fetch_tools": "Will fetch SEC filings and web search results for grounding",
    "run_analysis": "Will run the 5-agent analysis pipeline on retrieved sources",
    "generate_report": "Will generate a due diligence PDF report",
}


async def create_workflow_run(
    *,
    goal: str,
    user_id: str | None,
    scenario: dict,
    auto_approve: bool,
) -> WorkflowRun:
    row = WorkflowRun(
        id=uuid.uuid4(),
        user_id=user_id,
        goal=goal,
        ticker="",
        status="running",
        plan_json={},
        state_json={"scenario": scenario, "auto_approve": auto_approve},
        pending_checkpoint=None,
    )
    async with AsyncSessionLocal() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return row


async def get_workflow_run(workflow_id: str) -> WorkflowRun | None:
    try:
        async with AsyncSessionLocal() as session:
            return await session.get(WorkflowRun, uuid.UUID(workflow_id))
    except (ValueError, TypeError):
        return None


async def update_workflow_run(
    workflow_id: str,
    *,
    status: str | None = None,
    ticker: str | None = None,
    plan_json: dict | None = None,
    state_json: dict | None = None,
    pending_checkpoint: dict | None = None,
    report_id: str | None = None,
    analysis: dict | None = None,
) -> WorkflowRun | None:
    try:
        async with AsyncSessionLocal() as session:
            row = await session.get(WorkflowRun, uuid.UUID(workflow_id))
            if not row:
                return None
            if status is not None:
                row.status = status
            if ticker is not None:
                row.ticker = ticker
            if plan_json is not None:
                row.plan_json = plan_json
            if state_json is not None:
                merged = dict(row.state_json or {})
                merged.update(state_json)
                row.state_json = merged
            if pending_checkpoint is not None:
                row.pending_checkpoint = pending_checkpoint
            state = dict(row.state_json or {})
            if report_id is not None:
                state["report_id"] = report_id
            if analysis is not None:
                state["analysis"] = analysis
                state["analysis_result"] = analysis
            if report_id is not None or analysis is not None:
                row.state_json = state
            row.updated_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(row)
            return row
    except Exception as e:
        logger.warning("Failed to update workflow run: %s", e)
        return None


def workflow_to_response(row: WorkflowRun) -> dict[str, Any]:
    state = row.state_json or {}
    pending = row.pending_checkpoint
    status = row.status
    if pending and status == "running":
        status = "awaiting_approval"
    analysis = state.get("analysis") or state.get("analysis_result")
    return {
        "workflow_id": str(row.id),
        "status": status,
        "pending_checkpoint": pending,
        "plan": row.plan_json or None,
        "analysis": analysis,
        "report_id": state.get("report_id"),
    }


def detect_interrupt(next_nodes: list[str]) -> dict | None:
    for node in next_nodes:
        if node in CHECKPOINT_SUMMARIES:
            return {"step": node, "summary": CHECKPOINT_SUMMARIES[node]}
    return None


async def _persist_graph_snapshot(
    workflow_id: str,
    *,
    values: dict,
    next_nodes: tuple,
    auto_approve: bool,
) -> dict[str, Any]:
    pending = _checkpoint_from_next(next_nodes) if next_nodes and not auto_approve else None
    if values.get("status") == "failed" or values.get("error"):
        status = "failed"
        pending = None
    elif values.get("status") == "cancelled":
        status = "cancelled"
        pending = None
    elif pending:
        status = "awaiting_approval"
    elif not next_nodes:
        status = "completed"
    else:
        status = "running"

    await update_workflow_run(
        workflow_id,
        status=status,
        ticker=values.get("ticker"),
        plan_json=values.get("plan"),
        state_json=values,
        pending_checkpoint=pending,
        analysis=values.get("analysis_result"),
        report_id=values.get("report_id"),
    )
    row = await get_workflow_run(workflow_id)
    return workflow_to_response(row) if row else {"workflow_id": workflow_id, "status": status}


def _checkpoint_from_next(next_nodes: tuple) -> dict | None:
    return detect_interrupt(list(next_nodes))


async def start_due_diligence_workflow(
    goal: str,
    scenario: dict,
    *,
    user_id: str | None = None,
    auto_approve: bool = False,
) -> dict[str, Any]:
    from agents.orchestrator.graph import get_workflow_graph

    row = await create_workflow_run(
        goal=goal,
        user_id=user_id,
        scenario=scenario,
        auto_approve=auto_approve,
    )
    workflow_id = str(row.id)
    graph = get_workflow_graph(auto_approve=auto_approve)
    config = {"configurable": {"thread_id": workflow_id}}
    initial = {
        "workflow_id": workflow_id,
        "user_id": user_id,
        "goal": goal,
        "scenario": scenario,
        "auto_approve": auto_approve,
        "status": "running",
        "retrieved_chunks": [],
        "tool_outputs": [],
    }

    try:
        await graph.ainvoke(initial, config)
        snapshot = await graph.aget_state(config)
        values = dict(snapshot.values or {})
        return await _persist_graph_snapshot(
            workflow_id,
            values=values,
            next_nodes=tuple(snapshot.next or ()),
            auto_approve=auto_approve,
        )
    except Exception as exc:
        logger.exception("Workflow %s failed on start: %s", workflow_id, exc)
        await update_workflow_run(workflow_id, status="failed", state_json={"error": str(exc)})
        row = await get_workflow_run(workflow_id)
        resp = workflow_to_response(row) if row else {"workflow_id": workflow_id, "status": "failed"}
        resp["error"] = str(exc)
        return resp


async def get_workflow_status(workflow_id: str) -> dict[str, Any] | None:
    row = await get_workflow_run(workflow_id)
    if not row:
        return None
    return workflow_to_response(row)


async def resume_workflow(workflow_id: str, *, approved: bool) -> dict[str, Any] | None:
    from agents.orchestrator.graph import get_workflow_graph

    row = await get_workflow_run(workflow_id)
    if not row:
        return None

    if not approved:
        await update_workflow_run(workflow_id, status="cancelled", pending_checkpoint=None)
        row = await get_workflow_run(workflow_id)
        return workflow_to_response(row) if row else None

    state = row.state_json or {}
    auto_approve = bool(state.get("auto_approve", False))
    graph = get_workflow_graph(auto_approve=auto_approve)
    config = {"configurable": {"thread_id": workflow_id}}

    try:
        await update_workflow_run(workflow_id, pending_checkpoint=None)
        await graph.ainvoke(None, config)
        snapshot = await graph.aget_state(config)
        values = dict(snapshot.values or {})
        return await _persist_graph_snapshot(
            workflow_id,
            values=values,
            next_nodes=tuple(snapshot.next or ()),
            auto_approve=auto_approve,
        )
    except Exception as exc:
        logger.exception("Workflow %s failed on resume: %s", workflow_id, exc)
        await update_workflow_run(workflow_id, status="failed", state_json={"error": str(exc)})
        row = await get_workflow_run(workflow_id)
        resp = workflow_to_response(row) if row else {"workflow_id": workflow_id, "status": "failed"}
        resp["error"] = str(exc)
        return resp
