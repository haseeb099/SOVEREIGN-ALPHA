"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { HealthHistoryPoint, ThesisPoint } from "@sovereign/shared";
import { fetchHealthHistory } from "@/lib/api";
import { SAMPLE_THESIS_POINTS } from "@/lib/sample-thesis";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<ThesisPoint["status"], string> = {
  PASS: "bg-thesis-intact/15 text-thesis-intact border-thesis-intact/30",
  RISK: "bg-thesis-weakening/15 text-thesis-weakening border-thesis-weakening/30",
  FAIL: "bg-thesis-broken/15 text-thesis-broken border-thesis-broken/30",
  PENDING: "bg-muted text-muted-foreground",
};

export function ThesisHealthTimeline({ ticker }: { ticker: string }) {
  const [points, setPoints] = useState<HealthHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchHealthHistory(ticker, "90d")
      .then((data) => setPoints(data.points))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load history"))
      .finally(() => setLoading(false));
  }, [ticker]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const chartData = points.map((p) => ({
    date: new Date(p.created_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    score: p.score,
    target: p.target,
  }));

  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error) {
    return <ApiErrorState error={error} onRetry={loadHistory} />;
  }

  if (points.length === 0) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          No thesis health history yet. Run analysis to start tracking.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Thesis Health — 90d</CardTitle>
      </CardHeader>
      <CardContent className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#6b7280" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#6b7280" />
            <Tooltip
              contentStyle={{
                background: "#121524",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="var(--color-status-live)"
              strokeWidth={2}
              dot={false}
              name="Health %"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function ThesisTrackerPanel({
  points,
  ticker,
  onRunAnalysis,
}: {
  points: ThesisPoint[];
  ticker: string;
  onRunAnalysis?: () => void;
}) {
  if (!points.length) {
    return (
      <div className="flex flex-col gap-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3 text-center text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Getting started</span>
            {" — "}sample thesis points below. Run analysis to track live data for {ticker}.
          </CardContent>
        </Card>
        {SAMPLE_THESIS_POINTS.map((tp) => (
          <Card key={tp.id} className="border-border/60 bg-card/40 opacity-80">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <CardTitle className="text-sm leading-snug">{tp.text}</CardTitle>
              <Badge
                variant="outline"
                className={cn("shrink-0 font-mono text-[10px]", STATUS_CLASS[tp.status])}
              >
                {tp.status}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{tp.metric}</span>
              {tp.current_value && <span>Now: {tp.current_value}</span>}
              {tp.threshold && <span>Threshold: {tp.threshold}</span>}
              <Badge variant="outline" className="text-[9px]">
                Sample
              </Badge>
            </CardContent>
          </Card>
        ))}
        <EmptyState
          icon={BarChart3}
          title="Ready to track your thesis?"
          description="Run an analysis or upload a research document to replace samples with live thesis points."
          actionLabel="Run your first analysis"
          onAction={onRunAnalysis}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ThesisHealthTimeline ticker={ticker} />
      {points.map((tp) => (
        <Card key={tp.id} className="border-border/60 bg-card/40">
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            <CardTitle className="text-sm leading-snug">{tp.text}</CardTitle>
            <Badge
              variant="outline"
              id={`thesis-${tp.id}-status`}
              className={cn("shrink-0 font-mono text-[10px]", STATUS_CLASS[tp.status])}
            >
              {tp.status}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="font-mono">{tp.metric}</span>
            {tp.current_value && <span>Now: {tp.current_value}</span>}
            {tp.threshold && <span>Threshold: {tp.threshold}</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
