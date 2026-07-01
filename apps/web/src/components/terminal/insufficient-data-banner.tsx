"use client";

import { AlertTriangle } from "lucide-react";
import type { AgentTrace } from "@sovereign/shared";
import { cn } from "@/lib/utils";

export function getSynthesisInsufficient(
  agentTraces?: AgentTrace[],
): AgentTrace | null {
  if (!agentTraces?.length) return null;
  const synthesis = agentTraces.find((t) => t.agent === "SYNTHESIS");
  if (!synthesis?.insufficient_data) return null;
  return synthesis;
}

export function InsufficientDataBanner({
  agentTraces,
  className,
}: {
  agentTraces?: AgentTrace[];
  className?: string;
}) {
  const synthesis = getSynthesisInsufficient(agentTraces);
  if (!synthesis) return null;

  return (
    <div
      className={cn(
        "terminal-panel border-l-2 border-l-status-degraded bg-status-degraded/5",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-degraded" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-status-degraded">
            Insufficient verified data
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {synthesis.insufficient_reason ??
              "Retrieval did not return enough verified sources to support a high-confidence memo. Treat outputs below as low-confidence until more research is ingested."}
          </p>
        </div>
      </div>
    </div>
  );
}
