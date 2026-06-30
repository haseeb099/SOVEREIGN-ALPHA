"use client";

import { useEffect, useState } from "react";
import { BarChart2, ChevronDown, Info, Share2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FanChart, PriceHistoryChart, VerdictCards } from "@/components/terminal/memo-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useTerminal } from "@/providers/terminal-provider";
import { ShareReportDialog } from "@/components/terminal/share-report-dialog";
import { formatTimestamp } from "@/lib/format";
import { computeThesisHealthPct } from "@/lib/thesis-health";
import { ratingClass } from "@/lib/rating-styles";
import { cn } from "@/lib/utils";

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

function MetricCell({
  label,
  value,
  className,
  delta,
  hint,
}: {
  label: string;
  value: string;
  className?: string;
  delta?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border-r border-border px-3 py-2 last:border-r-0">
      <p className="panel-label flex items-center gap-1">
        {label}
        {hint && (
          <abbr title={hint} className="cursor-help no-underline">
            <Info className="size-3 text-muted-foreground" aria-hidden />
            <span className="sr-only">{hint}</span>
          </abbr>
        )}
      </p>
      <p className={cn("data-metric mt-0.5", className)}>{value}</p>
      {delta}
    </div>
  );
}

function sovereignScoreClass(score: number): string {
  if (score >= 70) return "text-thesis-intact";
  if (score >= 40) return "text-status-degraded";
  return "text-thesis-broken";
}

export default function MemoPage() {
  const { ticker, analysis, isAnalyzing, error, preview, analyze, isCached, lastUpdated, scenario } =
    useTerminal();
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);

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
  const baseTarget = memo.price_target;
  const baseHealth = computeThesisHealthPct(analysis);
  const hasPreview = preview != null;
  const displayTarget = preview?.price_target ?? baseTarget;
  const displayHealth = preview?.thesis_health_pct ?? baseHealth;
  const visibleWarnings = (memo.audit_warnings ?? []).filter((w) => !dismissedWarnings.has(w));
  const changePositive = analysis.asset_change_pct >= 0;

  return (
    <div className="flex flex-col gap-3">
      {isCached && (
        <div className="border border-status-degraded/30 bg-status-degraded/10 px-3 py-2 text-[11px] text-status-degraded">
          Showing cached analysis — live refresh unavailable. Check system status above.
        </div>
      )}
      <div className="terminal-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-2xl font-semibold tracking-tight">{ticker}</span>
            <span className="data-metric-lg">${analysis.asset_price.toFixed(2)}</span>
            <span className={cn("data-metric", changePositive ? "ticker-up" : "ticker-down")}>
              {changePositive ? "+" : ""}
              {analysis.asset_change_pct.toFixed(2)}%
            </span>
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground">
                Updated {formatTimestamp(lastUpdated, { showTz: true })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {hasPreview && (
              <Badge variant="outline" className="h-5 font-mono text-[9px] uppercase text-status-degraded">
                Scenario adjusted
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn("h-5 uppercase", ratingClass(memo.rating))}
              title={memo.rating === "NEUTRAL" ? "Neutral thesis — no directional edge." : undefined}
            >
              {memo.rating}
            </Badge>
            <Badge
              variant="outline"
              className="h-5 gap-0.5 uppercase"
              title={`Scenario sentiment: ${scenario.sentiment}`}
            >
              {scenario.sentiment}
              <ChevronDown className="size-2.5 opacity-60" aria-hidden />
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-5 gap-1 px-2 text-[9px] uppercase"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="size-3" />
              Share
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-3 lg:grid-cols-5">
          <MetricCell
            label="PT 12M"
            value={`$${baseTarget.toFixed(2)}`}
            className="text-primary"
            hint="12-month price target from the synthesis model"
            delta={
              hasPreview ? (
                <div className="mt-1">
                  <DeltaChip
                    label="Preview"
                    from={baseTarget}
                    to={preview?.price_target}
                    format={(n) => `$${n.toFixed(0)}`}
                  />
                </div>
              ) : undefined
            }
          />
          <MetricCell
            label="Thesis Health"
            value={`${baseHealth?.toFixed(0) ?? "—"}%`}
            hint={
              baseHealth === 0
                ? "No thesis points tracked yet — run analysis to compute health"
                : "Composite score from tracked thesis catalysts (0–100%)"
            }
            delta={
              hasPreview ? (
                <div className="mt-1">
                  <DeltaChip
                    label="Preview"
                    from={baseHealth}
                    to={preview?.thesis_health_pct}
                    format={(n) => `${n.toFixed(0)}%`}
                  />
                </div>
              ) : undefined
            }
          />
          <MetricCell
            label="Volatility (30D)"
            value={`${analysis.volatility_30d.toFixed(1)}%`}
          />
          {analysis.sovereign_score != null && (
            <MetricCell
              label="Sovereign Score"
              value={`${analysis.sovereign_score.toFixed(0)}/100`}
              className={sovereignScoreClass(analysis.sovereign_score)}
              hint="Composite conviction score across agents (0–100)"
            />
          )}
          <MetricCell
            label="Confidence Band"
            value={`$${memo.confidence_band[0].toFixed(0)}–$${memo.confidence_band[1].toFixed(0)}`}
            hint="Low–high range for the 12-month price target"
          />
        </div>

        {hasPreview && (
          <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
            <span className="text-[10px] text-muted-foreground">Scenario preview:</span>
            <span className="font-mono text-[10px] text-primary">
              PT ${displayTarget.toFixed(2)} · Health {displayHealth?.toFixed(0)}%
            </span>
          </div>
        )}

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
      <ShareReportDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        ticker={ticker}
        analysis={analysis}
      />
    </div>
  );
}
