"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FlaskConical, Loader2, Sparkles, Wand2 } from "lucide-react";
import type { DcfAssumptions, ValuationLabSnapshot } from "@sovereign/shared";
import {
  parseFinancialNlScenario,
  runDcfValuation,
  runLboValuation,
  runMonteCarloValuation,
  runSensitivityGrid,
} from "@/lib/api";
import { toastApiError, classifyFetchError } from "@/lib/api-errors";
import { useTerminal } from "@/providers/terminal-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { formatUsd } from "@/lib/format";
import { toast } from "sonner";

function AssumptionSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[10px]">
        <Label className="text-muted-foreground">{label}</Label>
        <span className="font-mono">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => {
          const next = Array.isArray(values) ? values[0] : values;
          if (typeof next === "number") onChange(next);
        }}
      />
    </div>
  );
}

function FootballFieldChart({
  bands,
  currentPrice,
}: {
  bands: { label: string; low: number; mid: number; high: number }[];
  currentPrice?: number | null;
}) {
  const data = bands.map((b) => ({
    name: b.label,
    range: [b.low, b.high],
    mid: b.mid,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(v) => formatUsd(Number(v))}
            contentStyle={{ fontSize: 11 }}
          />
          <Bar dataKey="mid" fill="hsl(var(--primary))" radius={2}>
            {data.map((_, i) => (
              <Cell key={i} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {currentPrice != null && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          Current: {formatUsd(currentPrice)}
        </p>
      )}
    </div>
  );
}

function SensitivityHeatmap({ grid }: { grid: ValuationLabSnapshot["sensitivity"] }) {
  if (!grid) return null;
  const { row_values, col_values, cells, row_axis, col_axis } = grid;
  const flat = cells.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);

  const color = (v: number) => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    const hue = 120 * t;
    return `hsla(${hue}, 55%, 45%, 0.35)`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-[10px]">
        <thead>
          <tr>
            <th className="p-1 text-left text-muted-foreground">{row_axis} \ {col_axis}</th>
            {col_values.map((c) => (
              <th key={c} className="p-1 font-mono text-muted-foreground">
                {(c * 100).toFixed(1)}%
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row_values.map((r, ri) => (
            <tr key={r}>
              <td className="p-1 font-mono text-muted-foreground">{(r * 100).toFixed(1)}%</td>
              {cells[ri]?.map((cell, ci) => (
                <td
                  key={ci}
                  className="p-1 text-center font-mono"
                  style={{ backgroundColor: color(cell) }}
                >
                  {formatUsd(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ValuationLabPanel({ ticker }: { ticker: string }) {
  const {
    analysis,
    valuationLab,
    runValuationLab,
    applyLabDistribution,
    isLabLoading,
  } = useTerminal();

  const [dcfAssumptions, setDcfAssumptions] = useState<DcfAssumptions>({
    projection_years: 5,
    wacc: 0.1,
    terminal_growth: 0.025,
    fcf_margin: 0.12,
    revenue_growth: 0.08,
  });
  const [lboAssumptions, setLboAssumptions] = useState({
    entry_multiple: 10,
    exit_multiple: 11,
    leverage_pct: 0.6,
    hold_years: 5,
  });
  const [nlText, setNlText] = useState("");
  const [nlExplanation, setNlExplanation] = useState<string | null>(null);
  const [localDcf, setLocalDcf] = useState(valuationLab?.dcf);
  const [localComps, setLocalComps] = useState(valuationLab?.comps);
  const [localLbo, setLocalLbo] = useState(valuationLab?.lbo);
  const [localMc, setLocalMc] = useState(valuationLab?.monte_carlo);
  const [localSens, setLocalSens] = useState(valuationLab?.sensitivity);
  const [autoFillError, setAutoFillError] = useState<string | null>(null);
  const sensTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (valuationLab?.dcf?.assumptions) {
      setDcfAssumptions((prev) => ({ ...prev, ...valuationLab.dcf!.assumptions }));
    }
    setLocalDcf(valuationLab?.dcf);
    setLocalComps(valuationLab?.comps);
    setLocalLbo(valuationLab?.lbo);
    setLocalMc(valuationLab?.monte_carlo);
    setLocalSens(valuationLab?.sensitivity);
  }, [valuationLab]);

  const refreshDcf = useCallback(async () => {
    try {
      const result = await runDcfValuation(ticker, dcfAssumptions);
      setLocalDcf(result);
    } catch (e) {
      toastApiError(e, { message: "DCF calculation failed" });
    }
  }, [ticker, dcfAssumptions]);

  useEffect(() => {
    if (sensTimer.current) clearTimeout(sensTimer.current);
    sensTimer.current = setTimeout(async () => {
      try {
        const grid = await runSensitivityGrid(ticker, dcfAssumptions);
        setLocalSens(grid);
      } catch {
        /* offline debounce */
      }
    }, 300);
    return () => {
      if (sensTimer.current) clearTimeout(sensTimer.current);
    };
  }, [ticker, dcfAssumptions]);

  const onGenerate = async (useLlm = false) => {
    if (useLlm) setAutoFillError(null);
    try {
      await runValuationLab(useLlm);
    } catch (e) {
      if (useLlm) {
        const msg = classifyFetchError(e).message;
        setAutoFillError(msg);
      }
    }
  };

  const onNlSubmit = async () => {
    if (!nlText.trim()) return;
    try {
      const parsed = await parseFinancialNlScenario(nlText);
      setNlExplanation(parsed.explanation);
      setDcfAssumptions((prev) => ({ ...prev, ...parsed.parsed_assumptions }));
      toast.success("Assumptions updated from scenario");
    } catch (e) {
      toastApiError(e, { message: "Could not parse scenario" });
    }
  };

  const mcHistogram = useMemo(
    () =>
      (localMc?.histogram ?? []).map((b) => ({
        name: `${b.bin_start}`,
        count: b.count,
      })),
    [localMc],
  );

  const competitive = analysis?.research_results?.competitive as
    | { peer_matrix?: unknown[] }
    | undefined;
  const competitiveAlt = analysis?.research_results?.competitive_analysis as
    | { peer_matrix?: unknown[] }
    | undefined;
  const hasPeerMatrix = Boolean(
    competitive?.peer_matrix?.length || competitiveAlt?.peer_matrix?.length,
  );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" />
            <h2 className="font-mono text-sm font-semibold">Valuation Lab — {ticker}</h2>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isLabLoading}
              onClick={() => void onGenerate(false)}
            >
              {isLabLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Run models"}
            </Button>
            <Button size="sm" disabled={isLabLoading} onClick={() => void onGenerate(true)}>
              {isLabLoading ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 size-3.5" />
              )}
              {isLabLoading ? "Auto-filling…" : "Auto-fill (AI)"}
            </Button>
          </div>
        </div>

        {autoFillError && (
          <p className="text-xs text-destructive">{autoFillError}</p>
        )}

        {valuationLab?.financials?.insufficient_data && (
          <Badge variant="outline" className="text-status-degraded">
            {valuationLab.financials.message ?? "Limited financial data — models use estimates"}
          </Badge>
        )}

        {/* DCF */}
        <Card className="border-border/60 bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">DCF</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <AssumptionSlider
              label="WACC"
              value={dcfAssumptions.wacc}
              min={0.05}
              max={0.18}
              step={0.005}
              format={(v) => `${(v * 100).toFixed(1)}%`}
              onChange={(wacc) => setDcfAssumptions((p) => ({ ...p, wacc }))}
            />
            <AssumptionSlider
              label="Terminal growth"
              value={dcfAssumptions.terminal_growth}
              min={0}
              max={0.05}
              step={0.0025}
              format={(v) => `${(v * 100).toFixed(2)}%`}
              onChange={(terminal_growth) =>
                setDcfAssumptions((p) => ({ ...p, terminal_growth }))
              }
            />
            <AssumptionSlider
              label="FCF margin"
              value={dcfAssumptions.fcf_margin ?? 0.12}
              min={0.02}
              max={0.35}
              step={0.01}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(fcf_margin) => setDcfAssumptions((p) => ({ ...p, fcf_margin }))}
            />
            <AssumptionSlider
              label="Projection years"
              value={dcfAssumptions.projection_years}
              min={3}
              max={10}
              step={1}
              format={(v) => `${v}y`}
              onChange={(projection_years) =>
                setDcfAssumptions((p) => ({ ...p, projection_years }))
              }
            />
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" onClick={() => void refreshDcf()}>
                Recalculate DCF
              </Button>
              {localDcf && (
                <>
                  <span className="font-mono text-sm">
                    Implied: {formatUsd(localDcf.implied_share_price)}
                  </span>
                  {localDcf.upside_pct != null && (
                    <Badge variant={localDcf.upside_pct >= 0 ? "default" : "destructive"}>
                      {localDcf.upside_pct >= 0 ? "+" : ""}
                      {localDcf.upside_pct.toFixed(1)}% vs current
                    </Badge>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Comps */}
        <Card className="border-border/60 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Comps football field</CardTitle>
            {hasPeerMatrix && (
              <Link
                href={`/terminal/${ticker}/dossier`}
                className="text-[10px] text-primary hover:underline"
              >
                View dossier peers →
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {localComps?.football_field ? (
              <FootballFieldChart
                bands={localComps.football_field}
                currentPrice={localComps.current_price}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Run models to populate comps.</p>
            )}
            {localComps && (
              <p className="mt-2 text-center font-mono text-xs text-muted-foreground">
                Range {formatUsd(localComps.implied_price_low)} –{" "}
                {formatUsd(localComps.implied_price_high)} (mid{" "}
                {formatUsd(localComps.implied_price_mid)})
              </p>
            )}
          </CardContent>
        </Card>

        {/* LBO */}
        <Card className="border-border/60 bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">LBO scaffold</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <AssumptionSlider
              label="Entry multiple"
              value={lboAssumptions.entry_multiple}
              min={4}
              max={20}
              step={0.5}
              format={(v) => `${v.toFixed(1)}x`}
              onChange={(entry_multiple) =>
                setLboAssumptions((p) => ({ ...p, entry_multiple }))
              }
            />
            <AssumptionSlider
              label="Exit multiple"
              value={lboAssumptions.exit_multiple}
              min={4}
              max={24}
              step={0.5}
              format={(v) => `${v.toFixed(1)}x`}
              onChange={(exit_multiple) =>
                setLboAssumptions((p) => ({ ...p, exit_multiple }))
              }
            />
            <AssumptionSlider
              label="Leverage"
              value={lboAssumptions.leverage_pct}
              min={0.2}
              max={0.85}
              step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(leverage_pct) =>
                setLboAssumptions((p) => ({ ...p, leverage_pct }))
              }
            />
            <AssumptionSlider
              label="Hold period"
              value={lboAssumptions.hold_years}
              min={3}
              max={7}
              step={1}
              format={(v) => `${v}y`}
              onChange={(hold_years) => setLboAssumptions((p) => ({ ...p, hold_years }))}
            />
            <Button
              size="sm"
              variant="secondary"
              className="sm:col-span-2"
              onClick={() =>
                void runLboValuation(ticker, lboAssumptions)
                  .then(setLocalLbo)
                  .catch((e) => toastApiError(e, { message: "LBO failed" }))
              }
            >
              Recalculate LBO
            </Button>
            {localLbo && (
              <div className="sm:col-span-2 flex gap-4">
                <div className="rounded border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">IRR</p>
                  <p className="font-mono text-lg">{localLbo.irr.toFixed(1)}%</p>
                </div>
                <div className="rounded border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">MOIC</p>
                  <p className="font-mono text-lg">{localLbo.moic.toFixed(2)}x</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monte Carlo */}
        <Card className="border-border/60 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Monte Carlo</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void runMonteCarloValuation(ticker, undefined, dcfAssumptions)
                  .then(setLocalMc)
                  .catch((e) => toastApiError(e, { message: "Monte Carlo failed" }))
              }
            >
              Simulate
            </Button>
          </CardHeader>
          <CardContent>
            {localMc ? (
              <>
                <div className="mb-2 flex gap-3 font-mono text-xs">
                  <span>P5 {formatUsd(localMc.p5)}</span>
                  <span>P50 {formatUsd(localMc.p50)}</span>
                  <span>P95 {formatUsd(localMc.p95)}</span>
                </div>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mcHistogram}>
                      <XAxis dataKey="name" hide />
                      <YAxis tick={{ fontSize: 10 }} width={28} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--chart-2))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    if (localMc.distribution) {
                      applyLabDistribution(localMc.distribution);
                      toast.success("Applied Monte Carlo distribution to memo preview");
                    }
                  }}
                >
                  Apply to memo distribution
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Run simulation for price distribution.</p>
            )}
          </CardContent>
        </Card>

        {/* What-If NL */}
        <Card className="border-border/60 bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1 text-sm">
              <Wand2 className="size-3.5" /> What-if (NL)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Input
              placeholder='e.g. "What if margins compress 300bps and rates rise 100bps?"'
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void onNlSubmit()}
            />
            <Button size="sm" variant="secondary" onClick={() => void onNlSubmit()}>
              Parse assumptions
            </Button>
            {nlExplanation && (
              <p className="text-[11px] text-muted-foreground">{nlExplanation}</p>
            )}
          </CardContent>
        </Card>

        {/* Sensitivity */}
        <Card className="border-border/60 bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sensitivity (WACC × terminal growth)</CardTitle>
          </CardHeader>
          <CardContent>
            <SensitivityHeatmap grid={localSens} />
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
