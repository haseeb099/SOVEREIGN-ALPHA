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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          12M Probability Fan
          {hasDistribution && (
            <span className="ml-2 text-[10px] font-normal text-muted-foreground">
              from memo.distribution
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        {loadingHistory && history.length === 0 ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fanData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#6b7280" />
              <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "#121524",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="bull"
                stroke="#34d399"
                fill="#34d399"
                fillOpacity={0.12}
                strokeWidth={2}
                name="Bull"
              />
              <Area
                type="monotone"
                dataKey="base"
                stroke="#60a5fa"
                fill="#60a5fa"
                fillOpacity={0.15}
                strokeWidth={2}
                name="Base"
              />
              <Area
                type="monotone"
                dataKey="bear"
                stroke="#fb7185"
                fill="#fb7185"
                fillOpacity={0.1}
                strokeWidth={2}
                name="Bear"
              />
              <Line
                type="monotone"
                dataKey="spot"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Spot"
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {history.length > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Price overlay: {history[history.length - 1]?.spot.toFixed(2)} (latest from market history)
          </p>
        )}
      </CardContent>
    </Card>
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
