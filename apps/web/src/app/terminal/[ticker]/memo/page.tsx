"use client";

import { useEffect, useState } from "react";
import { BarChart2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FanChart, PriceHistoryChart, VerdictCards } from "@/components/terminal/memo-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useTerminal } from "@/providers/terminal-provider";
import { isDataStale, staleDataLabel } from "@/lib/data-freshness";
import { computeThesisHealthPct } from "@/lib/thesis-health";
import { cn } from "@/lib/utils";

const RATING_CLASS = {
  BULLISH: "text-thesis-intact border-thesis-intact/30",
  NEUTRAL: "text-risk-moderate border-border",
  BEARISH: "text-thesis-broken border-thesis-broken/30",
} as const;

function MemoSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-56 w-full" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function MetricCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="border-r border-border px-3 py-2 last:border-r-0">
      <p className="panel-label">{label}</p>
      <p className={cn("data-metric mt-0.5", className)}>{value}</p>
    </div>
  );
}

export default function MemoPage() {
  const { ticker, analysis, isAnalyzing, error, preview, analyze, isCached, lastUpdated } =
    useTerminal();
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissedWarnings(new Set());
  }, [analysis?.timestamp]);

  if (isAnalyzing && !analysis) {
    return <MemoSkeleton />;
  }

  if (error && !analysis) {
    return <ApiErrorState error={error} onRetry={() => void analyze()} />;
  }

  if (!analysis && !isAnalyzing) {
    return (
      <EmptyState
        icon={BarChart2}
        title={`No analysis — ${ticker}`}
        description="Run the analysis pipeline to generate memo, thesis points, and price target."
        actionLabel="Run Analysis"
        onAction={() => void analyze()}
      />
    );
  }

  if (!analysis || (isAnalyzing && !analysis.memo)) {
    return <MemoSkeleton />;
  }

  const memo = analysis.memo;
  const displayTarget = preview?.price_target ?? memo.price_target;
  const baseHealth = computeThesisHealthPct(analysis);
  const displayHealth = preview?.thesis_health_pct ?? baseHealth;
  const staleLabel = staleDataLabel(lastUpdated);
  const visibleWarnings = (memo.audit_warnings ?? []).filter((w) => !dismissedWarnings.has(w));
  const changePositive = analysis.asset_change_pct >= 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Quote header — Bloomberg-style */}
      <div className="terminal-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-2">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-semibold tracking-tight">{ticker}</span>
            <span className="data-metric-lg">${analysis.asset_price.toFixed(2)}</span>
            <span className={cn("data-metric", changePositive ? "ticker-up" : "ticker-down")}>
              {changePositive ? "+" : ""}
              {analysis.asset_change_pct.toFixed(2)}%
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isCached && (
              <Badge variant="outline" className="h-5 font-mono text-[9px] uppercase">
                Cached
              </Badge>
            )}
            {staleLabel && (
              <Badge variant="outline" className="h-5 font-mono text-[9px] uppercase text-status-degraded">
                {staleLabel}
              </Badge>
            )}
            {!isCached && lastUpdated && !isDataStale(lastUpdated) && (
              <Badge variant="outline" className="h-5 font-mono text-[9px] uppercase text-status-live">
                Live
              </Badge>
            )}
            <Badge variant="outline" className={cn("h-5 font-mono text-[9px] uppercase", RATING_CLASS[memo.rating])}>
              {memo.rating}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
          <MetricCell label="PT 12M" value={`$${displayTarget.toFixed(2)}`} className="text-primary" />
          <MetricCell label="Thesis Health" value={`${displayHealth?.toFixed(0) ?? "—"}%`} />
          {analysis.sovereign_score != null && (
            <MetricCell label="Sovereign Score" value={analysis.sovereign_score.toFixed(0)} />
          )}
          <MetricCell
            label="Confidence Band"
            value={`$${memo.confidence_band[0].toFixed(0)}–$${memo.confidence_band[1].toFixed(0)}`}
          />
        </div>

        <p className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {memo.summary}
        </p>
      </div>

      <FanChart memo={memo} spot={analysis.asset_price} ticker={ticker} />
      <PriceHistoryChart ticker={ticker} />
      <VerdictCards memo={memo} rawAgents={analysis.raw_agents} />

      {visibleWarnings.length > 0 && (
        <div className="terminal-panel border-l-2 border-l-status-degraded">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="panel-label text-status-degraded">Audit Warnings</p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss audit warnings"
              onClick={() => setDismissedWarnings(new Set(memo.audit_warnings ?? []))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <ul className="px-3 py-2 text-[11px] text-muted-foreground">
            {visibleWarnings.map((w) => (
              <li key={w} className="border-b border-border/50 py-1.5 last:border-0">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
