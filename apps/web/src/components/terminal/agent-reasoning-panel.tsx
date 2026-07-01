"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AgentTrace, AnalyzeResponse, Citation } from "@sovereign/shared";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CitationChipList } from "@/components/terminal/citation-chip";
import { formatFactorLabel } from "@/lib/factor-labels";
import { cn } from "@/lib/utils";

type AgentData = {
  verdict?: string;
  citations?: Citation[] | { type?: string; label?: string; value?: string }[];
  factor_weights?: Record<string, number>;
  documents_referenced?: string[];
  log_message?: string;
  confidence?: number;
  reasoning_steps?: string[];
  error?: string;
};

function normalizeCitations(
  citations: AgentData["citations"],
): Citation[] {
  if (!citations?.length) return [];
  return citations.map((c) => {
    if ("source_label" in c && "data_point" in c) {
      return c as Citation;
    }
    const legacy = c as { type?: string; label?: string; value?: string };
    return {
      source_type: "market" as const,
      source_label: legacy.label ?? legacy.type ?? "Source",
      source_date: "",
      data_point: legacy.value ?? "",
    };
  });
}

function getAgentData(
  rawAgents: AnalyzeResponse["raw_agents"] | undefined,
  key: string,
): AgentData | null {
  if (!rawAgents || typeof rawAgents !== "object") return null;
  const data = (rawAgents as Record<string, unknown>)[key];
  if (!data || typeof data !== "object") return null;
  return data as AgentData;
}

function confidenceClass(score: number): string {
  if (score >= 7) return "border-thesis-intact/40 text-thesis-intact";
  if (score >= 4) return "border-status-degraded/40 text-status-degraded";
  return "border-thesis-broken/40 text-thesis-broken";
}

export function AgentReasoningPanel({
  title,
  variant,
  verdict,
  agentKey,
  rawAgents,
  agentTrace,
  feedbackSlot,
  className,
}: {
  title: string;
  variant: "bull" | "bear";
  verdict: string;
  agentKey: string;
  rawAgents?: AnalyzeResponse["raw_agents"];
  agentTrace?: AgentTrace | null;
  feedbackSlot?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const agent = getAgentData(rawAgents, agentKey);
  const confidence = agentTrace?.confidence ?? agent?.confidence;
  const citations = agentTrace?.citations?.length
    ? agentTrace.citations
    : normalizeCitations(agent?.citations);
  const reasoningSteps = agentTrace?.reasoning_steps ?? agent?.reasoning_steps;

  const accentClass =
    variant === "bull"
      ? "border-l-thesis-intact"
      : "border-l-thesis-broken";
  const titleClass = variant === "bull" ? "text-thesis-intact" : "text-thesis-broken";

  return (
    <div className={cn("terminal-panel border-l-2", accentClass, className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className={cn("font-mono text-[11px] font-semibold uppercase tracking-wide", titleClass)}>
            {title}
          </h3>
          {confidence != null && (
            <Badge
              variant="outline"
              className={cn("h-5 font-mono text-[9px]", confidenceClass(confidence))}
            >
              {confidence.toFixed(1)}/10
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {feedbackSlot}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="xs" className="h-6 font-mono text-[9px] uppercase">
                  Detail
                  <ChevronRight className="size-3" />
                </Button>
              }
            />
            <SheetContent side="right" className="w-full sm:max-w-md" showCloseButton>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{title} — Reasoning</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-4 text-xs">
                <section>
                  <h4 className="panel-label mb-1">Verdict</h4>
                  <p className="leading-relaxed text-muted-foreground">{agent?.verdict ?? verdict}</p>
                </section>
                {reasoningSteps && reasoningSteps.length > 0 && (
                  <section>
                    <h4 className="panel-label mb-1">Reasoning steps</h4>
                    <ol className="list-inside list-decimal space-y-1 font-mono text-[11px] text-muted-foreground">
                      {reasoningSteps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </section>
                )}
                {citations.length > 0 && (
                  <section>
                    <h4 className="panel-label mb-1">Citations</h4>
                    <CitationChipList citations={citations} />
                  </section>
                )}
                {agent?.factor_weights && (
                  <section>
                    <h4 className="panel-label mb-1">Factor Weights</h4>
                    <ul className="flex flex-col gap-1 font-mono text-[11px]">
                      {Object.entries(agent.factor_weights).map(([k, v]) => (
                        <li key={k} className="flex justify-between border-b border-border/50 py-1">
                          <span>{formatFactorLabel(k)}</span>
                          <span>{(v * 100).toFixed(0)}%</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {agent?.documents_referenced && agent.documents_referenced.length > 0 && (
                  <section>
                    <h4 className="panel-label mb-1">Documents</h4>
                    <ul className="list-inside list-disc text-muted-foreground">
                      {agent.documents_referenced.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {(agentTrace?.log_message || agent?.log_message) && (
                  <section>
                    <h4 className="panel-label mb-1">Log</h4>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {agentTrace?.log_message ?? agent?.log_message}
                    </p>
                  </section>
                )}
                {agent?.error && (
                  <p className="text-destructive">{agent.error}</p>
                )}
                {!agent && !agentTrace && (
                  <p className="text-muted-foreground">
                    Detailed reasoning available after the next analysis run.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <p className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {verdict}
      </p>
      {citations.length > 0 && (
        <div className="border-t border-border/50 px-3 py-2">
          <CitationChipList citations={citations.slice(0, 3)} />
        </div>
      )}
    </div>
  );
}
