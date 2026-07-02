"use client";

import { ApiErrorState } from "@/components/ui/api-error-state";
import { ValuationLabPanel } from "@/components/terminal/valuation-lab-panel";
import { useTerminal } from "@/providers/terminal-provider";

export default function LabPage() {
  const { ticker, error, runValuationLab, isLabLoading } = useTerminal();

  if (error && !isLabLoading) {
    return <ApiErrorState error={error} onRetry={() => void runValuationLab()} />;
  }

  return <ValuationLabPanel ticker={ticker} />;
}
