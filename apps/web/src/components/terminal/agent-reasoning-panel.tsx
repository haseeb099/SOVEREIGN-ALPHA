"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AnalyzeResponse } from "@sovereign/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
}: {
  title: string;
  variant: "bull" | "bear";
  verdict: string;
  agentKey: string;
  rawAgents?: AnalyzeResponse["raw_agents"];
}) {
  const [open, setOpen] = useState(false);
  const agent = getAgentData(rawAgents, agentKey);

  const borderClass =
    variant === "bull"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : "border-rose-500/20 bg-rose-500/5";
  const titleClass = variant === "bull" ? "text-emerald-400" : "text-rose-400";

  return (
    <Card className={borderClass}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className={cn("text-sm", titleClass)}>{title}</CardTitle>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="sm" className="h-7 text-[10px]">
                Reasoning
                <ChevronRight />
              </Button>
            }
          />
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{title} — Agent Reasoning</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex flex-col gap-4 text-xs">
              <section>
                <h4 className="mb-1 font-semibold text-foreground">Verdict</h4>
                <p className="text-muted-foreground">{agent?.verdict ?? verdict}</p>
              </section>
              {agent?.citations && agent.citations.length > 0 && (
                  <section>
                    <h4 className="mb-1 font-semibold text-foreground">Citations</h4>
                    <ul className="flex flex-col gap-1">
                      {agent.citations.map((c, i) => (
                        <li key={`${c.label}-${i}`} className="rounded border px-2 py-1 font-mono">
                          {c.label}: {c.value}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              {agent?.factor_weights && (
                <section>
                  <h4 className="mb-1 font-semibold text-foreground">Factor Weights</h4>
                  <ul className="flex flex-col gap-1 font-mono">
                    {Object.entries(agent.factor_weights).map(([k, v]) => (
                      <li key={k} className="flex justify-between">
                        <span>{k}</span>
                        <span>{(v * 100).toFixed(0)}%</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {agent?.documents_referenced && agent.documents_referenced.length > 0 && (
                <section>
                  <h4 className="mb-1 font-semibold text-foreground">Documents</h4>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {agent.documents_referenced.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </section>
              )}
              {agent?.log_message && (
                <section>
                  <h4 className="mb-1 font-semibold text-foreground">Log</h4>
                  <p className="font-mono text-muted-foreground">{agent.log_message}</p>
                </section>
              )}
              {agent?.error && (
                <p className="text-destructive">{agent.error}</p>
              )}
                {!agent && (
                  <p className="text-muted-foreground">
                    Detailed agent reasoning will appear after the next analysis run.
                  </p>
                )}
              </div>
            </SheetContent>
          </Sheet>
      </CardHeader>
      <CardContent className="text-xs leading-relaxed text-muted-foreground">
        {verdict}
      </CardContent>
    </Card>
  );
}
