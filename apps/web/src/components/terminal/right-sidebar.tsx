"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { PanelRight } from "lucide-react";
import { DEFAULT_SCENARIO } from "@sovereign/shared";
import { useTerminal } from "@/providers/terminal-provider";
import { parseNlScenario } from "@/lib/api";
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
import { cn } from "@/lib/utils";
import { computeThesisHealthPct, confidenceToHealthPct } from "@/lib/thesis-health";
import { toast } from "sonner";
import type { Scenario } from "@sovereign/shared";

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

export function RightSidebar({
  collapsed,
  onToggle,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { scenario, analysis, preview, previewOffline, applyScenarioField, setScenario, analyze } =
    useTerminal();
  const [nlScenario, setNlScenario] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [nlExplanation, setNlExplanation] = useState<string | null>(null);

  if (collapsed) {
    return (
      <div className={cn("flex h-full w-9 flex-col items-center border-l border-border py-2", className)}>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Expand scenario panel">
          <PanelRight className="size-4" />
        </Button>
      </div>
    );
  }

  const target = preview?.price_target ?? analysis?.memo.price_target;
  const baseHealth = computeThesisHealthPct(analysis ?? null);
  const health =
    preview?.thesis_health_pct ??
    (preview?.confidence_score != null ? confidenceToHealthPct(preview.confidence_score) : undefined) ??
    baseHealth;
  const baseTarget = analysis?.memo.price_target;

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
      toast.success(result.explanation || "Scenario updated");
      setNlScenario("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setNlParsing(false);
    }
  };

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-border bg-card/60 xl:w-[280px]",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="panel-label">Scenario Lab</span>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse" className="xl:hidden">
          <PanelRight className="size-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap gap-1">
            <DeltaChip label="PT" from={baseTarget} to={preview?.price_target} format={(n) => `$${n.toFixed(0)}`} />
            <DeltaChip label="THS" from={baseHealth} to={preview?.thesis_health_pct} format={(n) => `${n.toFixed(0)}%`} />
          </div>

          <ScenarioSlider label="Margins" value={scenario.margins} min={5} max={35} step={0.5} suffix="%" onChange={(v) => applyScenarioField("margins", v)} />
          <ScenarioSlider label="Rates" value={scenario.rates} min={0} max={10} step={0.25} suffix="%" onChange={(v) => applyScenarioField("rates", v)} />

          <Field label="Regulatory">
            <Select value={scenario.regulatory} onValueChange={(v) => applyScenarioField("regulatory", v as Scenario["regulatory"])}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Sentiment">
            <Select value={scenario.sentiment} onValueChange={(v) => applyScenarioField("sentiment", v as Scenario["sentiment"])}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bullish">Bullish</SelectItem>
                <SelectItem value="Neutral">Neutral</SelectItem>
                <SelectItem value="Bearish">Bearish</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="border border-border bg-background/50 p-2">
            <div className="flex items-center justify-between">
              <span className="panel-label">Preview</span>
              {previewOffline && (
                <Badge variant="outline" className="h-4 font-mono text-[8px]">EST</Badge>
              )}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[9px] text-muted-foreground">PT</p>
                <p className="data-metric text-primary">${target?.toFixed(0) ?? "—"}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">THS</p>
                <p className="data-metric">{health?.toFixed(0) ?? "—"}%</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" className="h-8 font-mono text-[9px] uppercase" onClick={() => void analyze()}>
              Run Pipeline
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 font-mono text-[9px] uppercase"
              onClick={() => {
                setScenario(DEFAULT_SCENARIO);
                setNlExplanation(null);
              }}
            >
              Reset
            </Button>
          </div>

          <Field label="NL Scenario">
            <Input
              value={nlScenario}
              onChange={(e) => setNlScenario(e.target.value)}
              placeholder="Margins compress 200bps…"
              className="h-8 text-xs"
              onKeyDown={(e) => e.key === "Enter" && void applyNlScenario()}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-8 w-full font-mono text-[9px] uppercase"
              disabled={nlParsing || !nlScenario.trim()}
              onClick={() => void applyNlScenario()}
            >
              {nlParsing ? "Parsing…" : "Parse & Apply"}
            </Button>
            {nlExplanation && (
              <p className="mt-1 text-[10px] text-muted-foreground">{nlExplanation}</p>
            )}
          </Field>
        </div>
      </ScrollArea>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="panel-label">{label}</Label>
      {children}
    </div>
  );
}

function ScenarioSlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px]">
        <span className="panel-label">{label}</span>
        <span className="font-mono text-foreground">
          {value.toFixed(step < 1 ? 1 : 0)}
          {suffix}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          if (typeof n === "number") onChange(n);
        }}
        className="py-2"
      />
    </div>
  );
}
