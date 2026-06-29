"use client";

import { ThesisTrackerPanel } from "@/components/terminal/thesis-tracker-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useTerminal } from "@/providers/terminal-provider";

export default function TrackerPage() {
  const { analysis, isAnalyzing, ticker, analyze } = useTerminal();

  if (isAnalyzing && !analysis) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <ThesisTrackerPanel
      points={analysis?.thesis_points ?? []}
      ticker={ticker}
      onRunAnalysis={() => void analyze()}
    />
  );
}
