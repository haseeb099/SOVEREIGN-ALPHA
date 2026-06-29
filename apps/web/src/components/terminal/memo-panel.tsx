"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";

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

export function PriceHistoryChart({ ticker }: { ticker: string }) {
  const [history, setHistory] = useState<{ label: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void fetchMarketHistory(ticker, "1y")
      .then((bars) => {
        if (cancelled) return;
        const points = bars
          .map((b, i) => {
            const close = barClose(b);
            if (close == null) return null;
            const label =
              typeof b.date === "string"
                ? b.date.slice(5, 10)
                : `T-${bars.length - i}`;
            return { label, price: close };
          })
          .filter((p): p is { label: string; price: number } => p != null)
          .slice(-60);
        setHistory(points);
        if (points.length === 0) setError(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <div className="terminal-panel">
      <div className="border-b border-border px-3 py-2">
        <p className="panel-label">Price History · 1Y</p>
      </div>
      <div className="h-48 p-3">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : error || history.length === 0 ? (
          <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Price history unavailable — connect to live data
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
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
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.12 0.01 260)",
                  border: "1px solid oklch(1 0 0 / 10%)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
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
        )}
      </div>
    </div>
  );
}

export function FanChart({ memo, spot, ticker }: { memo: Memo; spot: number; ticker: string }) {
  const fanData = useMemo(() => buildFanData(memo, spot), [memo, spot]);
  const [history, setHistory] = useState<{ label: string; spot: number }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    void fetchMarketHistory(ticker, "1y").then((bars) => {
      if (cancelled) return;
      const points = bars
        .map((b, i) => {
          const close = barClose(b);
          if (close == null) return null;
          const label =
            typeof b.date === "string"
              ? b.date.slice(0, 7)
              : `T-${bars.length - i}`;
          return { label, spot: close };
        })
        .filter((p): p is { label: string; spot: number } => p != null)
        .slice(-24);
      setHistory(points);
      setLoadingHistory(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const hasDistribution = Boolean(memo.distribution);

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
      <div className="h-56 p-3">
        {loadingHistory && history.length === 0 ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fanData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "oklch(0.52 0.015 260)" }} stroke="oklch(1 0 0 / 10%)" />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.52 0.015 260)" }} stroke="oklch(1 0 0 / 10%)" domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.12 0.01 260)",
                  border: "1px solid oklch(1 0 0 / 10%)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
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
        )}
        {history.length > 0 && (
          <p className="mt-1 px-3 pb-2 font-mono text-[10px] text-muted-foreground">
            Last: ${history[history.length - 1]?.spot.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}

export function VerdictCards({
  memo,
  rawAgents,
}: {
  memo: Memo;
  rawAgents?: AnalyzeResponse["raw_agents"];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <AgentReasoningPanel
        title="Bull Case"
        variant="bull"
        verdict={memo.bull_verdict}
        agentKey="bull"
        rawAgents={rawAgents}
      />
      <AgentReasoningPanel
        title="Bear Case"
        variant="bear"
        verdict={memo.bear_verdict}
        agentKey="red_team"
        rawAgents={rawAgents}
      />
    </div>
  );
}
