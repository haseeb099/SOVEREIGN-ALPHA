"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AgentTrace, AnalyzeResponse } from "@sovereign/shared";
import { CitationChipList } from "@/components/terminal/citation-chip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RESEARCH_AGENT_ORDER = [
  "COMPANY_RESEARCH",
  "SECTOR_MACRO",
  "COMPETITIVE",
  "ESG",
  "INSIDER",
  "OPTIONS_FLOW",
] as const;

const CORE_AGENT_ORDER = [
  "PLANNING",
  "FUNDAMENTAL",
  "MACRO",
  "BULL",
  "RED_TEAM",
  "SYNTHESIS",
  "VERIFICATION",
] as const;

const AGENT_ORDER = [...RESEARCH_AGENT_ORDER, ...CORE_AGENT_ORDER] as const;

const AGENT_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  COMPANY_RESEARCH: "Company Research",
  SECTOR_MACRO: "Sector & Macro",
  COMPETITIVE: "Competitive",
  ESG: "ESG & Compliance",
  INSIDER: "Insider Sentiment",
  OPTIONS_FLOW: "Options Flow",
  FUNDAMENTAL: "Fundamental",
  MACRO: "Macro",
  BULL: "Bull Case",
  RED_TEAM: "Red Team",
  SYNTHESIS: "Synthesis",
  VERIFICATION: "Verification",
};

function traceFromRaw(
  agentName: AgentTrace["agent"],
  data: Record<string, unknown>,
): AgentTrace {
  return {
    agent: agentName,
    confidence: Number(data.confidence ?? data.confidence_score ?? data.score ?? 5),
    insufficient_data: Boolean(data.insufficient_data),
    insufficient_reason:
      typeof data.insufficient_reason === "string" ? data.insufficient_reason : undefined,
    citations: Array.isArray(data.citations)
      ? (data.citations as AgentTrace["citations"])
      : [],
    reasoning_steps: Array.isArray(data.reasoning_steps)
      ? (data.reasoning_steps as string[])
      : undefined,
    log_message: String(data.log_message ?? `${agentName} complete`),
    elapsed_ms: typeof data.elapsed_ms === "number" ? data.elapsed_ms : undefined,
  };
}

export function resolveAgentTraces(
  analysis: Pick<
    AnalyzeResponse,
    "agent_traces" | "raw_agents" | "research_traces"
  >,
): AgentTrace[] {
  const merged: AgentTrace[] = [];
  const seen = new Set<string>();

  const pushTrace = (trace: AgentTrace) => {
    if (seen.has(trace.agent)) return;
    seen.add(trace.agent);
    merged.push(trace);
  };

  for (const trace of analysis.research_traces ?? []) {
    pushTrace(trace);
  }

  if (analysis.agent_traces?.length) {
    for (const trace of analysis.agent_traces) {
      pushTrace(trace);
    }
    return merged;
  }

  const raw = analysis.raw_agents;
  if (!raw || typeof raw !== "object") return merged;

  const keyMap: Record<string, AgentTrace["agent"]> = {
    company_research: "COMPANY_RESEARCH",
    sector_macro: "SECTOR_MACRO",
    sector_macro_research: "SECTOR_MACRO",
    competitive: "COMPETITIVE",
    competitive_analysis: "COMPETITIVE",
    esg: "ESG",
    esg_compliance: "ESG",
    insider: "INSIDER",
    insider_sentiment: "INSIDER",
    options_flow: "OPTIONS_FLOW",
    planning: "PLANNING",
    fundamental: "FUNDAMENTAL",
    macro: "MACRO",
    bull: "BULL",
    red_team: "RED_TEAM",
    synthesis: "SYNTHESIS",
    verification: "VERIFICATION",
  };

  for (const [key, agentName] of Object.entries(keyMap)) {
    const data = (raw as Record<string, unknown>)[key];
    if (!data || typeof data !== "object") continue;
    pushTrace(traceFromRaw(agentName, data as Record<string, unknown>));
  }

  return merged;
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

function orderTraces(traces: AgentTrace[]): AgentTrace[] {
  const ordered = AGENT_ORDER.map((name) => traces.find((t) => t.agent === name)).filter(
    (t): t is AgentTrace => Boolean(t),
  );
  const extras = traces.filter(
    (t) => !AGENT_ORDER.includes(t.agent as (typeof AGENT_ORDER)[number]),
  );
  return [...ordered, ...extras];
}

export function PipelineTracePanel({
  traces,
  analysis,
}: {
  traces?: AgentTrace[];
  analysis?: Pick<AnalyzeResponse, "agent_traces" | "raw_agents" | "research_traces">;
}) {
  const resolved = traces ?? (analysis ? resolveAgentTraces(analysis) : []);
  if (!resolved.length) return null;

  const researchTraces = orderTraces(
    resolved.filter((t) =>
      RESEARCH_AGENT_ORDER.includes(t.agent as (typeof RESEARCH_AGENT_ORDER)[number]),
    ),
  );
  const coreTraces = orderTraces(
    resolved.filter(
      (t) =>
        !RESEARCH_AGENT_ORDER.includes(t.agent as (typeof RESEARCH_AGENT_ORDER)[number]),
    ),
  );

  return (
    <div className="terminal-panel">
      <div className="border-b border-border px-3 py-2">
        <p className="panel-label">Agent Reasoning Trace</p>
        <p className="text-[10px] text-muted-foreground">
          Expand each step to review confidence, citations, and reasoning.
        </p>
      </div>
      {researchTraces.length > 0 && (
        <div className="border-b border-border/60">
          <p className="panel-label border-b border-border/40 bg-muted/20 px-3 py-1.5 text-[9px]">
            Research pre-pass
          </p>
          {researchTraces.map((trace) => (
            <TraceRow key={trace.agent} trace={trace} />
          ))}
        </div>
      )}
      {coreTraces.length > 0 && (
        <div>
          {researchTraces.length > 0 && (
            <p className="panel-label border-b border-border/40 bg-muted/20 px-3 py-1.5 text-[9px]">
              Core pipeline
            </p>
          )}
          {coreTraces.map((trace) => (
            <TraceRow key={trace.agent} trace={trace} />
          ))}
        </div>
      )}
    </div>
  );
}
