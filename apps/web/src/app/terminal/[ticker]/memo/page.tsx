"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FanChart, VerdictCards } from "@/components/terminal/memo-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useTerminal } from "@/providers/terminal-provider";
import { isDataStale, staleDataLabel } from "@/lib/data-freshness";
import { computeThesisHealthPct } from "@/lib/thesis-health";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const RATING_CLASS = {
  BULLISH: "text-thesis-intact",
  NEUTRAL: "text-risk-moderate",
  BEARISH: "text-thesis-broken",
} as const;

function MemoSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-56 w-full" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
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
        icon={Sparkles}
        title={`No analysis for ${ticker}`}
        description="Run the AI pipeline to generate a memo, thesis points, and price target."
        actionLabel="Run analysis"
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

  return (
    <div className="flex flex-col gap-4">
      <Card className="animate-fade-in border-border/60 bg-card/40">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
          <div>
            <CardTitle className="font-mono text-xl">{ticker}</CardTitle>
            <p className="text-xs text-muted-foreground">
              ${analysis.asset_price.toFixed(2)} ({analysis.asset_change_pct >= 0 ? "+" : ""}
              {analysis.asset_change_pct.toFixed(2)}%)
              {analysis.sovereign_score != null && (
                <span className="ml-2">
                  Sovereign Score {analysis.sovereign_score.toFixed(0)}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isCached && (
              <Badge variant="outline" className="text-[10px] text-status-degraded">
                Cached
              </Badge>
            )}
            {staleLabel && (
              <Badge variant="outline" className="text-[10px] text-status-degraded">
                {staleLabel}
              </Badge>
            )}
            {!isCached && lastUpdated && !isDataStale(lastUpdated) && (
              <Badge variant="outline" className="text-[10px] text-status-live">
                Live
              </Badge>
            )}
            <Badge variant="outline" className={cn("font-mono", RATING_CLASS[memo.rating])}>
              {memo.rating}
            </Badge>
            <Badge variant="outline" className="font-mono">
              Target ${displayTarget.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="font-mono">
              Health {displayHealth?.toFixed(0) ?? "—"}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          {memo.summary}
        </CardContent>
      </Card>

      <FanChart memo={memo} spot={analysis.asset_price} ticker={ticker} />
      <VerdictCards memo={memo} rawAgents={analysis.raw_agents} />

      {visibleWarnings.length > 0 && (
        <Card className="border-status-degraded/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-status-degraded">Audit Warnings</CardTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss audit warnings"
              onClick={() => setDismissedWarnings(new Set(memo.audit_warnings ?? []))}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <ul className="list-inside list-disc">
              {visibleWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
