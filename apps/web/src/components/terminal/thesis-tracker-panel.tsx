"use client";

import Link from "next/link";
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
import { Loader2, Pencil, Trash2, CheckCircle2, BarChart3, ChevronDown, ChevronUp, History, X } from "lucide-react";
import type { HealthHistoryPoint, HistoryDiff, ThesisPoint } from "@sovereign/shared";
import { fetchHealthHistory, fetchHistory, fetchHistoryDiff } from "@/lib/api";
import { SAMPLE_THESIS_POINTS } from "@/lib/sample-thesis";
import { formatTimestamp } from "@/lib/format";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function onboardingKey(ticker: string) {
  return `sovereign-tracker-onboarding-${ticker}`;
}

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

const PENDING_HINT = "Awaiting next data point — catalyst not yet evaluated";

export function ThesisTrackerPanel({
  points,
  ticker,
  onRunAnalysis,
  isAnalyzing,
  hasAnalysis,
}: {
  points: ThesisPoint[];
  ticker: string;
  onRunAnalysis?: () => void;
  isAnalyzing?: boolean;
  hasAnalysis?: boolean;
}) {
  const [diff, setDiff] = useState<HistoryDiff | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [historyItems, setHistoryItems] = useState<
    { id: string; created_at: string; memo?: { rating?: string; price_target?: number } }[]
  >([]);
  const [localPoints, setLocalPoints] = useState<ThesisPoint[]>(points);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    setLocalPoints(points);
  }, [points]);

  useEffect(() => {
    try {
      setBannerDismissed(localStorage.getItem(onboardingKey(ticker)) === "1");
    } catch {
      setBannerDismissed(false);
    }
  }, [ticker]);

  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(onboardingKey(ticker), "1");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void fetchHistoryDiff(ticker)
      .then(setDiff)
      .catch(() => setDiff(null));
    void fetchHistory(ticker)
      .then((data) => setHistoryItems(data.items ?? []))
      .catch(() => setHistoryItems([]));
  }, [ticker]);

  const showSampleMode = !hasAnalysis && !points.length;

  const DiffCard = diff ? (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Since last run</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3 text-xs">
        <Badge variant="outline" className="font-mono">
          Target Δ {diff.target_delta >= 0 ? "+" : ""}
          {diff.target_delta.toFixed(2)}
        </Badge>
        <span className="text-muted-foreground">
          {(diff.current as { memo?: { rating?: string } }).memo?.rating ?? "—"} vs{" "}
          {(diff.prior as { memo?: { rating?: string } }).memo?.rating ?? "—"}
        </span>
      </CardContent>
    </Card>
  ) : null;

  const HistorySection = (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4" />
          Analysis history
        </CardTitle>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setHistoryOpen((o) => !o)}
          aria-label="Toggle history"
        >
          {historyOpen ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </CardHeader>
      {historyOpen && (
        <CardContent className="flex flex-col gap-2 text-xs">
          {historyItems.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">No prior analyses recorded.</p>
              {onRunAnalysis && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit gap-1 text-[10px]"
                  onClick={onRunAnalysis}
                  disabled={isAnalyzing}
                >
                  Run Analysis →
                </Button>
              )}
            </div>
          ) : (
            historyItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded border border-border/50 px-2 py-1.5"
              >
                <span className="text-muted-foreground">
                  {formatTimestamp(item.created_at, { showTz: true })}
                </span>
                <Badge variant="outline" className="font-mono">
                  {item.memo?.rating ?? "—"} · $
                  {item.memo?.price_target?.toFixed(0) ?? "—"}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      )}
    </Card>
  );

  if (showSampleMode) {
    return (
      <div className="flex flex-col gap-3">
        {!bannerDismissed && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start justify-between gap-2 py-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Getting started</span>
                {" — "}sample thesis points below. Run analysis to track live data for {ticker}.
              </p>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss onboarding banner"
                onClick={dismissBanner}
              >
                <X className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        )}
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
          actionLabel={isAnalyzing ? "Analyzing…" : "Run your first analysis"}
          onAction={onRunAnalysis}
        />
        {isAnalyzing && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Running analysis pipeline…
          </div>
        )}
      </div>
    );
  }

  if (!points.length && hasAnalysis) {
    return (
      <div className="flex flex-col gap-3">
        {DiffCard}
        {HistorySection}
        <ThesisHealthTimeline ticker={ticker} />
        <EmptyState
          icon={BarChart3}
          title="No thesis points yet"
          description="Analysis completed but no trackable thesis points were returned. Re-run analysis or upload a research document."
          actionLabel={isAnalyzing ? "Analyzing…" : "Re-run analysis"}
          onAction={onRunAnalysis}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {DiffCard}
      {HistorySection}
      <ThesisHealthTimeline ticker={ticker} />
      {localPoints.map((tp) => (
        <Card key={tp.id} className="border-border/60 bg-card/40">
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            {editingId === tp.id ? (
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="text-sm"
                aria-label="Edit catalyst text"
              />
            ) : (
              <CardTitle className="text-sm leading-snug">{tp.text}</CardTitle>
            )}
            <Badge
              variant="outline"
              title={tp.status === "PENDING" ? PENDING_HINT : undefined}
              className={cn("shrink-0 font-mono text-[10px]", STATUS_CLASS[tp.status])}
            >
              {tp.status}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{tp.metric}</span>
              {tp.current_value && <span>Now: {tp.current_value}</span>}
              {tp.threshold && <span>Threshold: {tp.threshold}</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {editingId === tp.id ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px]"
                  onClick={() => {
                    setLocalPoints((prev) =>
                      prev.map((p) => (p.id === tp.id ? { ...p, text: editText } : p)),
                    );
                    setEditingId(null);
                  }}
                >
                  Save
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-[10px]"
                  aria-label={`Edit ${tp.text}`}
                  onClick={() => {
                    setEditingId(tp.id);
                    setEditText(tp.text);
                  }}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-[10px]"
                aria-label={`Mark ${tp.text} resolved`}
                onClick={() =>
                  setLocalPoints((prev) =>
                    prev.map((p) =>
                      p.id === tp.id ? { ...p, status: "PASS" as const } : p,
                    ),
                  )
                }
              >
                <CheckCircle2 className="size-3" />
                Resolved
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-[10px] text-destructive"
                aria-label={`Delete ${tp.text}`}
                onClick={() => setLocalPoints((prev) => prev.filter((p) => p.id !== tp.id))}
              >
                <Trash2 className="size-3" />
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
