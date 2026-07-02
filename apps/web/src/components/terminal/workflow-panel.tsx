"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Loader2,
  SkipForward,
  XCircle,
} from "lucide-react";
import type { Scenario, WorkflowPlanStep, WorkflowStatus } from "@sovereign/shared";
import {
  approveWorkflowCheckpoint,
  getWorkflowStatus,
  rejectWorkflow,
  startDueDiligenceWorkflow,
} from "@/lib/api";
import { classifyFetchError, toastApiError } from "@/lib/api-errors";
import { PipelineTracePanel } from "@/components/terminal/pipeline-trace-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const POLL_MS = 2000;

const STATUS_LABELS: Record<WorkflowStatus["status"], string> = {
  awaiting_approval: "Awaiting approval",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<
  WorkflowStatus["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  awaiting_approval: "secondary",
  running: "default",
  completed: "outline",
  failed: "destructive",
  cancelled: "outline",
};

function stepStatusIcon(status?: WorkflowPlanStep["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-3.5 text-thesis-intact" aria-hidden />;
    case "running":
      return <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />;
    case "failed":
      return <XCircle className="size-3.5 text-destructive" aria-hidden />;
    case "skipped":
      return <SkipForward className="size-3.5 text-muted-foreground" aria-hidden />;
    default:
      return <Circle className="size-3.5 text-muted-foreground" aria-hidden />;
  }
}

function formatStepLabel(step: WorkflowPlanStep): string {
  if (step.summary) return step.summary;
  const tool = step.tool.replace(/_/g, " ");
  return `${step.id.replace(/_/g, " ")} (${tool})`;
}

function isActiveWorkflow(status?: WorkflowStatus["status"]): boolean {
  return status === "running" || status === "awaiting_approval";
}

export function WorkflowPanel({
  ticker,
  scenario,
  onAnalysisReady,
}: {
  ticker: string;
  scenario: Scenario;
  onAnalysisReady?: (analysis: NonNullable<WorkflowStatus["analysis"]>) => void;
}) {
  const [workflow, setWorkflow] = useState<WorkflowStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [acting, setActing] = useState(false);
  const [hitlOpen, setHitlOpen] = useState(false);
  const completedRef = useRef(false);

  const refreshStatus = useCallback(async (workflowId: string) => {
    const next = await getWorkflowStatus(workflowId);
    setWorkflow(next);
    if (next.status === "awaiting_approval") {
      setHitlOpen(true);
    }
    if (
      next.status === "completed" &&
      next.analysis &&
      !completedRef.current
    ) {
      completedRef.current = true;
      onAnalysisReady?.(next.analysis);
      toast.success("Due diligence workflow complete");
    }
    return next;
  }, [onAnalysisReady]);

  useEffect(() => {
    if (!workflow?.workflow_id || !isActiveWorkflow(workflow.status)) return;
    const id = workflow.workflow_id;
    const timer = window.setInterval(() => {
      void refreshStatus(id).catch((err) => {
        toastApiError(err, { message: "Failed to refresh workflow status" });
      });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [workflow?.workflow_id, workflow?.status, refreshStatus]);

  useEffect(() => {
    if (workflow?.status === "awaiting_approval") {
      setHitlOpen(true);
    }
  }, [workflow?.status]);

  const dismissHitlDialog = (open: boolean) => {
    setHitlOpen(open);
    if (!open) toast.dismiss();
  };

  const startWorkflow = async () => {
    setStarting(true);
    completedRef.current = false;
    try {
      const goal = `Do full due diligence on ${ticker}`;
      const result = await startDueDiligenceWorkflow(goal, scenario, false);
      setWorkflow(result);
      if (result.status === "awaiting_approval") {
        setHitlOpen(true);
      }
      toast.info("Due diligence workflow started");
    } catch (err) {
      toastApiError(err, { message: "Failed to start workflow" });
    } finally {
      setStarting(false);
    }
  };

  const handleApprove = async () => {
    if (!workflow?.workflow_id || !workflow.pending_checkpoint) return;
    setActing(true);
    try {
      const next = await approveWorkflowCheckpoint(
        workflow.workflow_id,
        workflow.pending_checkpoint.step,
      );
      setWorkflow(next);
      setHitlOpen(false);
      toast.success("Checkpoint approved");
    } catch (err) {
      toastApiError(err, { message: "Failed to approve checkpoint" });
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!workflow?.workflow_id) return;
    setActing(true);
    try {
      const next = await rejectWorkflow(workflow.workflow_id);
      setWorkflow(next);
      setHitlOpen(false);
      toast.info("Workflow cancelled");
    } catch (err) {
      toastApiError(err, { message: "Failed to reject workflow" });
    } finally {
      setActing(false);
    }
  };

  const steps = workflow?.plan?.steps ?? [];
  const workflowTicker = workflow?.plan?.ticker ?? workflow?.analysis?.ticker ?? ticker;

  return (
    <div className="flex min-h-0 flex-col gap-3 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="panel-label">Autonomous Due Diligence</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Plan, fetch filings, analyze, verify, and generate a report for {ticker}.
          </p>
        </div>
        {workflow && (
          <Badge variant={STATUS_VARIANT[workflow.status]} className="shrink-0 font-mono text-[9px]">
            {STATUS_LABELS[workflow.status]}
          </Badge>
        )}
      </div>

      {!workflow ? (
        <Button
          size="sm"
          className="h-8 w-full font-mono text-[10px] uppercase"
          onClick={() => void startWorkflow()}
          disabled={starting}
        >
          {starting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Starting…
            </>
          ) : (
            "Run Due Diligence"
          )}
        </Button>
      ) : (
        <>
          {workflow.plan?.goal_summary && (
            <p className="border border-border bg-muted/20 p-2 text-[11px] leading-snug text-muted-foreground">
              {workflow.plan.goal_summary}
            </p>
          )}

          {steps.length > 0 && (
            <div className="terminal-panel overflow-hidden">
              <div className="border-b border-border px-3 py-2">
                <p className="panel-label">Workflow Plan</p>
              </div>
              <ol className="divide-y divide-border/60">
                {steps.map((step) => (
                  <li
                    key={step.id}
                    className={cn(
                      "flex items-start gap-2 px-3 py-2",
                      step.status === "running" && "bg-primary/5",
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{stepStatusIcon(step.status)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wide">
                        {step.id.replace(/_/g, " ")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{formatStepLabel(step)}</p>
                    </div>
                    {step.status && (
                      <Badge variant="outline" className="h-4 shrink-0 font-mono text-[9px] capitalize">
                        {step.status}
                      </Badge>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {isActiveWorkflow(workflow.status) && (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Polling workflow status every 2s…
            </p>
          )}

          {workflow.status === "failed" && (
            <div className="space-y-1 text-[11px] text-destructive">
              <p>Workflow failed. Check API health and try a new run.</p>
              <p className="text-muted-foreground">
                If this persists, verify CEREBRAS_API_KEY and backend logs, then start a fresh
                workflow from the button below.
              </p>
            </div>
          )}

          {workflow.status === "cancelled" && (
            <p className="text-[11px] text-muted-foreground">
              Workflow was cancelled at checkpoint approval.
            </p>
          )}

          {workflow.status === "completed" && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                render={<Link href={`/terminal/${workflowTicker}/memo`} />}
              >
                View memo
              </Button>
              {workflow.report_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  render={<Link href={`/reports/${workflow.report_id}`} />}
                >
                  View report
                </Button>
              )}
            </div>
          )}

          {workflow.analysis && (
            <PipelineTracePanel analysis={workflow.analysis} />
          )}

          {(workflow.status === "completed" ||
            workflow.status === "failed" ||
            workflow.status === "cancelled") && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full font-mono text-[10px] uppercase"
              onClick={() => {
                setWorkflow(null);
                completedRef.current = false;
              }}
            >
              Start new workflow
            </Button>
          )}
        </>
      )}

      <Dialog open={hitlOpen} onOpenChange={dismissHitlDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Approve workflow checkpoint?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <Badge variant="outline" className="font-mono text-[9px]">
              {workflow?.pending_checkpoint?.step?.replace(/_/g, " ").toUpperCase() ?? "CHECKPOINT"}
            </Badge>
            <p className="leading-snug text-muted-foreground">
              {workflow?.pending_checkpoint?.summary ??
                "The workflow is waiting for your approval before continuing."}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleReject()}
              disabled={acting}
            >
              Reject
            </Button>
            <Button size="sm" onClick={() => void handleApprove()} disabled={acting}>
              {acting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Approving…
                </>
              ) : (
                "Approve"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}