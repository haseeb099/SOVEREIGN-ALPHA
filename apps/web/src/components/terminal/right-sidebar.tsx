"use client";

import { useEffect, useState } from "react";
import { PanelRight, Sparkles } from "lucide-react";
import type { MacroEvent, Scenario } from "@sovereign/shared";
import { useTerminal } from "@/providers/terminal-provider";
import { fetchMacroEvents, parseNlScenario } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { computeThesisHealthPct, confidenceToHealthPct } from "@/lib/thesis-health";
import { toast } from "sonner";

function DeltaChip({
  label,
  from,
  to,
  format = (n: number) => n.toFixed(1),
}: {
  label: string;
  from?: number;
  to?: number;
  format?: (n: number) => string;
}) {
  if (from == null || to == null) return null;
  const delta = to - from;
  if (Math.abs(delta) < 0.01) return null;
  const sign = delta > 0 ? "+" : "";
  const up = delta > 0;
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[10px]",
        up ? "border-status-live/40 text-status-live" : "border-status-offline/40 text-status-offline",
      )}
    >
      {label}: {format(from)} → {format(to)} ({sign}
      {format(delta)})
    </Badge>
  );
}

function baseThesisHealth(analysis: ReturnType<typeof useTerminal>["analysis"]) {
  return computeThesisHealthPct(analysis ?? null);
}

export function RightSidebar({
  collapsed,
  onToggle,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { ticker, scenario, analysis, preview, previewOffline, applyScenarioField, setScenario, analyze } =
    useTerminal();
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [nlScenario, setNlScenario] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [nlExplanation, setNlExplanation] = useState<string | null>(null);

  useEffect(() => {
    setEventsLoading(true);
    void fetchMacroEvents(ticker)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [ticker]);

  const injectEvent = (event: MacroEvent) => {
    const impact = (event.impact ?? "").toLowerCase();
    const category = (event.category ?? "").toLowerCase();
    if (category.includes("rate") || event.title.toLowerCase().includes("fed")) {
      applyScenarioField("rates", Math.min(10, scenario.rates + 0.5));
    } else if (impact.includes("bear")) {
      applyScenarioField("sentiment", "Bearish");
    } else if (impact.includes("bull")) {
      applyScenarioField("sentiment", "Bullish");
    } else {
      applyScenarioField("regulatory", "High");
    }
    toast.info("Macro event applied to scenario sliders");
  };

  const applyNlScenario = async () => {
    const text = nlScenario.trim();
    if (!text) return;
    setNlParsing(true);
    try {
      const result = await parseNlScenario(text);
      const parsed = result.parsed_scenario;
      const next: Scenario = { ...scenario };
      if (typeof parsed.margins === "number") next.margins = parsed.margins;
      if (typeof parsed.rates === "number") next.rates = parsed.rates;
      if (parsed.regulatory === "Low" || parsed.regulatory === "Medium" || parsed.regulatory === "High") {
        next.regulatory = parsed.regulatory;
      }
      if (parsed.sentiment === "Bullish" || parsed.sentiment === "Neutral" || parsed.sentiment === "Bearish") {
        next.sentiment = parsed.sentiment;
      }
      setScenario(next);
      setNlExplanation(result.explanation || "Scenario updated");
      toast.success(result.explanation || "Scenario updated from NL input");
      setNlScenario("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "NL parse failed");
    } finally {
      setNlParsing(false);
    }
  };

  if (collapsed) {
    return (
      <div className={cn("flex w-10 flex-col items-center gap-2 border-l py-2", className)}>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Expand scenario panel">
          <PanelRight />
        </Button>
      </div>
    );
  }

  const target = preview?.price_target ?? analysis?.memo.price_target;
  const health =
    preview?.thesis_health_pct ??
    (preview?.confidence_score != null ? confidenceToHealthPct(preview.confidence_score) : undefined) ??
    baseThesisHealth(analysis);
  const baseHealth = baseThesisHealth(analysis);
  const baseTarget = analysis?.memo.price_target;

  return (
    <aside className={cn("flex w-72 shrink-0 flex-col border-l bg-card/30", className)}>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground">
          SCENARIO LAB
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse scenario panel">
          <PanelRight />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex flex-wrap gap-1">
            <DeltaChip
              label="Target"
              from={baseTarget}
              to={preview?.price_target}
              format={(n) => `$${n.toFixed(2)}`}
            />
            <DeltaChip
              label="Thesis Health"
              from={baseHealth}
              to={preview?.thesis_health_pct}
              format={(n) => `${n.toFixed(0)}%`}
            />
            {preview?.deltas && (
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                Δ target {preview.deltas.price_target >= 0 ? "+" : ""}
                {preview.deltas.price_target.toFixed(2)}
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs">
              <Label>Margins</Label>
              <span className="font-mono">{scenario.margins.toFixed(1)}%</span>
            </div>
            <Slider
              min={5}
              max={35}
              step={0.5}
              value={[scenario.margins]}
              aria-label={`Margins ${scenario.margins.toFixed(1)} percent`}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value;
                if (typeof v === "number") applyScenarioField("margins", v);
              }}
              className="min-h-11 py-3"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs">
              <Label>Rates</Label>
              <span className="font-mono">{scenario.rates.toFixed(1)}%</span>
            </div>
            <Slider
              min={0}
              max={10}
              step={0.25}
              value={[scenario.rates]}
              aria-label={`Rates ${scenario.rates.toFixed(1)} percent`}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value;
                if (typeof v === "number") applyScenarioField("rates", v);
              }}
              className="min-h-11 py-3"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Regulatory</Label>
            <Select
              value={scenario.regulatory}
              onValueChange={(v) =>
                applyScenarioField("regulatory", v as typeof scenario.regulatory)
              }
            >
              <SelectTrigger className="min-h-11 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Sentiment</Label>
            <Select
              value={scenario.sentiment}
              onValueChange={(v) =>
                applyScenarioField("sentiment", v as typeof scenario.sentiment)
              }
            >
              <SelectTrigger className="min-h-11 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Bullish">Bullish</SelectItem>
                <SelectItem value="Neutral">Neutral</SelectItem>
                <SelectItem value="Bearish">Bearish</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-2 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Live Preview</span>
              {previewOffline && (
                <Badge variant="outline" className="text-[9px]">
                  offline estimate
                </Badge>
              )}
            </div>
            <div className="font-mono">Target ${target?.toFixed(2) ?? "—"}</div>
            <div className="font-mono">Health {health?.toFixed(0) ?? "—"}%</div>
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="min-h-11"
            onClick={() => void analyze()}
          >
            Apply to AI (full pipeline)
          </Button>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">NL Scenario</Label>
            <Input
              value={nlScenario}
              onChange={(e) => setNlScenario(e.target.value)}
              placeholder="e.g. Tesla misses deliveries 20%…"
              className="min-h-11 text-xs"
              onKeyDown={(e) => e.key === "Enter" && void applyNlScenario()}
            />
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={nlParsing || !nlScenario.trim()}
              onClick={() => void applyNlScenario()}
            >
              <Sparkles className={cn(nlParsing && "animate-pulse")} />
              {nlParsing ? "Parsing…" : "Parse & Apply"}
            </Button>
            {nlExplanation && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {nlExplanation}
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Macro Event Feed</Label>
            <div className="flex flex-col gap-1">
              {eventsLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : events.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No live events</p>
              ) : (
                events.map((ev, i) => (
                  <button
                    key={ev.id ?? `${ev.title}-${i}`}
                    type="button"
                    onClick={() => injectEvent(ev)}
                    className="min-h-11 rounded-md border border-border/50 p-2 text-left text-[11px] hover:bg-muted/60"
                  >
                    <div className="font-medium">{ev.title}</div>
                    {ev.impact && (
                      <div className="text-muted-foreground">{ev.impact}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
