"use client";

import { BarChart2 } from "lucide-react";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ResearchDossierPanel } from "@/components/terminal/research-dossier-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useTerminal } from "@/providers/terminal-provider";

function DossierSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function DossierPage() {
  const { ticker, analysis, isAnalyzing, error, analyze, isCached } = useTerminal();

  const runWithResearch = () => void analyze(undefined, { enable_research: true });

  if (isAnalyzing && !analysis) {
    return <DossierSkeleton />;
  }

  if (error && !analysis) {
    return <ApiErrorState error={error} onRetry={runWithResearch} />;
  }

  if (!analysis && !isAnalyzing) {
    return (
      <EmptyState
        icon={BarChart2}
        title={`No research dossier — ${ticker}`}
        description="Run analysis with the research pre-pass to populate the six-agent dossier."
        actionLabel="Run Analysis with research"
        onAction={runWithResearch}
      />
    );
  }

  if (!analysis) {
    return <DossierSkeleton />;
  }

  if (isAnalyzing) {
    return (
      <div className="relative flex flex-col gap-3">
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-background/40 pt-8 backdrop-blur-[1px]">
          <DossierSkeleton />
        </div>
        <div className="opacity-50">
          <ResearchDossierPanel analysis={analysis} onRunResearch={runWithResearch} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isCached && (
        <div className="border border-status-degraded/30 bg-status-degraded/10 px-3 py-2 text-[11px] text-status-degraded">
          Showing cached dossier — live refresh unavailable. Check system status above.
        </div>
      )}
      {error != null ? (
        <div className="border border-status-degraded/30 bg-status-degraded/10 px-3 py-2 text-[11px] text-status-degraded">
          Latest refresh failed — showing last successful dossier.
        </div>
      ) : null}
      <ResearchDossierPanel analysis={analysis} onRunResearch={runWithResearch} />
    </div>
  );
}
