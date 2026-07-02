"use client";

import { BarChart3 } from "lucide-react";
import { ThesisTrackerPanel } from "@/components/terminal/thesis-tracker-panel";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTerminal } from "@/providers/terminal-provider";

function TrackerSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export default function TrackerPage() {
  const { analysis, isAnalyzing, ticker, analyze, error } = useTerminal();

  if (isAnalyzing && !analysis) {
    return <TrackerSkeleton />;
  }

  if (error && !analysis) {
    return <ApiErrorState error={error} onRetry={() => void analyze()} />;
  }

  if (!analysis && !isAnalyzing) {
    return (
      <EmptyState
        icon={BarChart3}
        title={`No thesis tracker — ${ticker}`}
        description="Run analysis to extract falsifiable thesis points and track PASS / RISK / FAIL status."
        actionLabel="Run Analysis"
        onAction={() => void analyze()}
      />
    );
  }

  if (isAnalyzing && analysis) {
    return (
      <div className="relative flex flex-col gap-3">
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-background/40 pt-8 backdrop-blur-[1px]">
          <TrackerSkeleton />
        </div>
        <div className="opacity-50">
          <ThesisTrackerPanel
            points={analysis?.thesis_points ?? []}
            ticker={ticker}
            onRunAnalysis={() => void analyze()}
            isAnalyzing={isAnalyzing}
            hasAnalysis={analysis != null}
          />
        </div>
      </div>
    );
  }

  return (
    <ThesisTrackerPanel
      points={analysis?.thesis_points ?? []}
      ticker={ticker}
      onRunAnalysis={() => void analyze()}
      isAnalyzing={isAnalyzing}
      hasAnalysis={analysis != null}
    />
  );
}
