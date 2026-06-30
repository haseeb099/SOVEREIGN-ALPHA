"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AnalyzeResponse } from "@sovereign/shared";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatFactorLabel } from "@/lib/factor-labels";
import { cn } from "@/lib/utils";

type AgentData = {
  verdict?: string;
  citations?: { type?: string; label?: string; value?: string }[];
  factor_weights?: Record<string, number>;
  documents_referenced?: string[];
  log_message?: string;
  error?: string;
};

function getAgentData(
  rawAgents: AnalyzeResponse["raw_agents"] | undefined,
  key: string,
): AgentData | null {
  if (!rawAgents || typeof rawAgents !== "object") return null;
  const data = (rawAgents as Record<string, unknown>)[key];
  if (!data || typeof data !== "object") return null;
  return data as AgentData;
}

export function AgentReasoningPanel({
  title,
  variant,
  verdict,
  agentKey,
  rawAgents,
  className,
}: {
  title: string;
  variant: "bull" | "bear";
  verdict: string;
  agentKey: string;
  rawAgents?: AnalyzeResponse["raw_agents"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const agent = getAgentData(rawAgents, agentKey);

  const accentClass =
    variant === "bull"
      ? "border-l-thesis-intact"
      : "border-l-thesis-broken";
  const titleClass = variant === "bull" ? "text-thesis-intact" : "text-thesis-broken";

  return (
    <div className={cn("terminal-panel border-l-2", accentClass, className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className={cn("font-mono text-[11px] font-semibold uppercase tracking-wide", titleClass)}>
          {title}
        </h3>
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
              {agent?.citations && agent.citations.length > 0 && (
                  <section>
                    <h4 className="panel-label mb-1">Citations</h4>
                    <ul className="flex flex-col gap-1">
                      {agent.citations.map((c, i) => (
                        <li key={`${c.label}-${i}`} className="border border-border px-2 py-1 font-mono text-[11px]">
                          {c.label}: {c.value}
                        </li>
                      ))}
                    </ul>
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
              {agent?.log_message && (
                <section>
                  <h4 className="panel-label mb-1">Log</h4>
                  <p className="font-mono text-[11px] text-muted-foreground">{agent.log_message}</p>
                </section>
              )}
              {agent?.error && (
                <p className="text-destructive">{agent.error}</p>
              )}
                {!agent && (
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
      <p className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {verdict}
      </p>
    </div>
  );
}
