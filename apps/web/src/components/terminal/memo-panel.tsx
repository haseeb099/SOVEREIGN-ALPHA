"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyzeResponse, Memo } from "@sovereign/shared";
import { fetchMarketHistory } from "@/lib/api";
import { AgentReasoningPanel } from "@/components/terminal/agent-reasoning-panel";
import { getAgentConfidence, resolveAgentTraces } from "@/components/terminal/pipeline-trace-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const HISTORY_RANGES = [
  { key: "1w", label: "1W", api: "1w" },
  { key: "1m", label: "1M", api: "1m" },
  { key: "3m", label: "3M", api: "3m" },
  { key: "6m", label: "6M", api: "6m" },
  { key: "1y", label: "1Y", api: "1y" },
] as const;

type HistoryRange = (typeof HISTORY_RANGES)[number]["key"];

function buildFanData(memo: Memo, spot: number) {
  const dist = memo.distribution;
  if (dist) {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    return [
      { month: "Now", bear: spot, base: spot, bull: spot, spot },
      {
        month: "6M",
        bear: lerp(spot, dist.bear.price, 0.5),
        base: lerp(spot, dist.base.price, 0.5),
        bull: lerp(spot, dist.bull.price, 0.5),
        spot: null as number | null,
      },
      {
        month: "12M",
        bear: dist.bear.price,
        base: dist.base.price,
        bull: dist.bull.price,
        spot: null as number | null,
      },
    ];
  }

  const [low, high] = memo.confidence_band;
  const target = memo.price_target;
  return [
    { month: "Now", bear: spot, base: spot, bull: spot, spot },
    { month: "6M", bear: low, base: (low + target) / 2, bull: target, spot: null },
    { month: "12M", bear: low, base: target, bull: high, spot: null },
  ];
}

function barClose(bar: { close?: number; c?: number; price?: number }): number | null {
  const v = bar.close ?? bar.c ?? bar.price;
  return typeof v === "number" ? v : null;
}

function formatPriceTick(v: number) {
  return `$${v.toFixed(0)}`;
}

export function PriceHistoryChart({ ticker }: { ticker: string }) {
  const [range, setRange] = useState<HistoryRange>("1y");
  const [history, setHistory] = useState<{ label: string; date: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiRange = HISTORY_RANGES.find((r) => r.key === range)?.api ?? "1y";

  const loadHistory = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMarketHistory(ticker, apiRange)
      .then(({ bars, error: fetchError }) => {
        if (cancelled) return;
        const points = bars
          .map((b, i) => {
            const close = barClose(b);
            if (close == null) return null;
            const dateStr = typeof b.date === "string" ? b.date : `T-${bars.length - i}`;
            const label =
              typeof b.date === "string"
                ? b.date.slice(5, 10)
                : `T-${bars.length - i}`;
            return { label, date: dateStr, price: close };
          })
          .filter((p): p is { label: string; date: string; price: number } => p != null);
        const sliceCount =
          range === "1w" ? 7 : range === "1m" ? 22 : range === "3m" ? 66 : range === "6m" ? 126 : 252;
        const sliced = points.slice(-sliceCount);
        setHistory(sliced);
        const flatData =
          sliced.length > 1 && sliced.every((p) => p.price === sliced[0]!.price);
        if (points.length === 0) {
          setError(fetchError ?? "No price history available");
        } else if (flatData) {
          setError(
            fetchError ??
              "Market data feed not configured — chart ranges may look identical",
          );
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load price history");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, apiRange, range]);

  useEffect(() => {
    return loadHistory();
  }, [loadHistory]);

  const rangeLabel = HISTORY_RANGES.find((r) => r.key === range)?.label ?? "1Y";
  const chartLabel = `${ticker} price history chart, ${rangeLabel} range`;

  return (
    <div className="terminal-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="panel-label">Price History</p>
          <Link
            href={`/terminal/${ticker}/charts`}
            className="font-mono text-[9px] text-primary hover:underline"
          >
            Full charts →
          </Link>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Price history range">
          {HISTORY_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[9px] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                range === r.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-48 p-3">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : error || history.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-muted-foreground">
              {error ?? "Price history unavailable"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={loadHistory}>
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px]"
                render={<Link href="/settings" />}
              >
                Data sources
              </Button>
            </div>
          </div>
        ) : (
          <div role="img" aria-label={chartLabel} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <ComposedChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "oklch(0.52 0.015 260)" }}
                  stroke="oklch(1 0 0 / 10%)"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "oklch(0.52 0.015 260)" }}
                  stroke="oklch(1 0 0 / 10%)"
                  domain={["auto", "auto"]}
                  tickFormatter={formatPriceTick}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.12 0.01 260)",
                    border: "1px solid oklch(1 0 0 / 10%)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload as { date?: string } | undefined;
                    return item?.date ?? "";
                  }}
                  formatter={(value) => [`$${Number(value).toFixed(2)}`, "Close"]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="oklch(0.78 0.14 75)"
                  strokeWidth={1.5}
                  dot={false}
                  name="Close"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export function FanChart({ memo, spot, ticker }: { memo: Memo; spot: number; ticker: string }) {
  const fanData = useMemo(() => buildFanData(memo, spot), [memo, spot]);
  const hasDistribution = Boolean(memo.distribution);
  const chartLabel = `${ticker} 12-month probability fan chart, spot $${spot.toFixed(2)}`;

  return (
    <div className="terminal-panel">
      <div className="border-b border-border px-3 py-2">
        <p className="panel-label">
          12M Probability Fan
          {hasDistribution && (
            <span className="ml-2 normal-case tracking-normal text-muted-foreground">
              · distribution model
            </span>
          )}
        </p>
      </div>
      <div className="min-h-[14rem] min-w-0 w-full overflow-hidden p-3">
        <div role="img" aria-label={chartLabel}>
          <ResponsiveContainer width="100%" height={224} debounce={50}>
            <ComposedChart data={fanData} margin={{ top: 8, right: 8, left: 48, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "oklch(0.52 0.015 260)" }}
                stroke="oklch(1 0 0 / 10%)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.52 0.015 260)" }}
                stroke="oklch(1 0 0 / 10%)"
                domain={["auto", "auto"]}
                tickFormatter={formatPriceTick}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.12 0.01 260)",
                  border: "1px solid oklch(1 0 0 / 10%)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, ""]}
              />
              <Area
                type="monotone"
                dataKey="bull"
                stroke="oklch(0.65 0.15 145)"
                fill="oklch(0.65 0.15 145)"
                fillOpacity={0.08}
                strokeWidth={1.5}
                name="Bull"
              />
              <Area
                type="monotone"
                dataKey="base"
                stroke="oklch(0.78 0.14 75)"
                fill="oklch(0.78 0.14 75)"
                fillOpacity={0.1}
                strokeWidth={1.5}
                name="Base"
              />
              <Area
                type="monotone"
                dataKey="bear"
                stroke="oklch(0.58 0.18 25)"
                fill="oklch(0.58 0.18 25)"
                fillOpacity={0.08}
                strokeWidth={1.5}
                name="Bear"
              />
              <Line
                type="monotone"
                dataKey="spot"
                stroke="oklch(0.88 0.01 260)"
                strokeWidth={1.5}
                dot={{ r: 2 }}
                name="Spot"
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function VerdictCards({
  memo,
  analysis,
  bullFeedback,
  bearFeedback,
}: {
  memo: Memo;
  analysis?: Pick<AnalyzeResponse, "raw_agents" | "agent_traces">;
  bullFeedback?: React.ReactNode;
  bearFeedback?: React.ReactNode;
}) {
  const traces = analysis ? resolveAgentTraces(analysis) : [];
  const bullTrace = traces.find((t) => t.agent === "BULL");
  const bearTrace = traces.find((t) => t.agent === "RED_TEAM");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <AgentReasoningPanel
        title="Bull Case"
        variant="bull"
        verdict={memo.bull_verdict}
        agentKey="bull"
        rawAgents={analysis?.raw_agents}
        agentTrace={bullTrace}
        feedbackSlot={bullFeedback}
      />
      <AgentReasoningPanel
        title="Bear Case"
        variant="bear"
        verdict={memo.bear_verdict}
        agentKey="red_team"
        rawAgents={analysis?.raw_agents}
        agentTrace={bearTrace}
        feedbackSlot={bearFeedback}
      />
    </div>
  );
}

export { getAgentConfidence, resolveAgentTraces };
