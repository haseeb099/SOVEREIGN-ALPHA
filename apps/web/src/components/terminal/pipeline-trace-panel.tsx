"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AgentTrace, AnalyzeResponse } from "@sovereign/shared";
import { CitationChipList } from "@/components/terminal/citation-chip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const AGENT_ORDER = [
  "PLANNING",
  "FUNDAMENTAL",
  "MACRO",
  "BULL",
  "RED_TEAM",
  "SYNTHESIS",
  "VERIFICATION",
] as const;

const AGENT_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  FUNDAMENTAL: "Fundamental",
  MACRO: "Macro",
  BULL: "Bull Case",
  RED_TEAM: "Red Team",
  SYNTHESIS: "Synthesis",
  VERIFICATION: "Verification",
};

export function resolveAgentTraces(
  analysis: Pick<AnalyzeResponse, "agent_traces" | "raw_agents">,
): AgentTrace[] {
  if (analysis.agent_traces?.length) return analysis.agent_traces;
  const raw = analysis.raw_agents;
  if (!raw || typeof raw !== "object") return [];
  const keyMap: Record<string, string> = {
    planning: "PLANNING",
    fundamental: "FUNDAMENTAL",
    macro: "MACRO",
    bull: "BULL",
    red_team: "RED_TEAM",
    synthesis: "SYNTHESIS",
    verification: "VERIFICATION",
  };
  const traces: AgentTrace[] = [];
  for (const [key, agentName] of Object.entries(keyMap)) {
    const data = (raw as Record<string, unknown>)[key];
    if (!data || typeof data !== "object") continue;
    const d = data as Record<string, unknown>;
    traces.push({
      agent: agentName as AgentTrace["agent"],
      confidence: Number(d.confidence ?? d.confidence_score ?? d.score ?? 5),
      insufficient_data: Boolean(d.insufficient_data),
      insufficient_reason: typeof d.insufficient_reason === "string" ? d.insufficient_reason : undefined,
      citations: Array.isArray(d.citations) ? (d.citations as AgentTrace["citations"]) : [],
      reasoning_steps: Array.isArray(d.reasoning_steps) ? (d.reasoning_steps as string[]) : undefined,
      log_message: String(d.log_message ?? `${agentName} complete`),
    });
  }
  return traces;
}

export function getAgentConfidence(
  traces: AgentTrace[],
  agent: AgentTrace["agent"],
): number | undefined {
  return traces.find((t) => t.agent === agent)?.confidence;
}

function confidenceClass(score: number): string {
  if (score >= 7) return "text-thesis-intact";
  if (score >= 4) return "text-status-degraded";
  return "text-thesis-broken";
}

function TraceRow({ trace }: { trace: AgentTrace }) {
  const [open, setOpen] = useState(trace.agent === "SYNTHESIS");
  const label = AGENT_LABELS[trace.agent] ?? trace.agent;

  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide">{label}</span>
        <Badge variant="outline" className={cn("ml-auto h-4 font-mono text-[9px]", confidenceClass(trace.confidence))}>
          {trace.confidence.toFixed(1)}/10
        </Badge>
        {trace.insufficient_data && (
          <Badge variant="outline" className="h-4 text-[9px] text-status-degraded">
            Low data
          </Badge>
        )}
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3 pl-8 text-xs">
          <p className="text-muted-foreground">{trace.log_message}</p>
          {trace.insufficient_reason && (
            <p className="text-[11px] text-status-degraded">{trace.insufficient_reason}</p>
          )}
          {trace.reasoning_steps && trace.reasoning_steps.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {trace.reasoning_steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
          <CitationChipList citations={trace.citations} />
        </div>
      )}
    </div>
  );
}

export function PipelineTracePanel({
  traces,
  analysis,
}: {
  traces?: AgentTrace[];
  analysis?: Pick<AnalyzeResponse, "agent_traces" | "raw_agents">;
}) {
  const resolved = traces ?? (analysis ? resolveAgentTraces(analysis) : []);
  if (!resolved.length) return null;

  const ordered = AGENT_ORDER.map((name) => resolved.find((t) => t.agent === name)).filter(
    (t): t is AgentTrace => Boolean(t),
  );
  const extras = resolved.filter((t) => !AGENT_ORDER.includes(t.agent as (typeof AGENT_ORDER)[number]));
  const displayTraces = [...ordered, ...extras];

  return (
    <div className="terminal-panel">
      <div className="border-b border-border px-3 py-2">
        <p className="panel-label">Agent Reasoning Trace</p>
        <p className="text-[10px] text-muted-foreground">
          Expand each step to review confidence, citations, and reasoning.
        </p>
      </div>
      <div>{displayTraces.map((trace) => (
        <TraceRow key={trace.agent} trace={trace} />
      ))}</div>
    </div>
  );
}
