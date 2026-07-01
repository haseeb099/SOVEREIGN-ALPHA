"use client";

import { useEffect, useState } from "react";
import type { RiskMetrics } from "@sovereign/shared";
import { fetchRiskMetrics } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatPct(n: number, digits = 2) {
  return `${(n * 100).toFixed(digits)}%`;
}

function MetricCell({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <div className="min-w-0 flex-1 border-r border-border px-3 py-2 last:border-r-0">
      <p className="panel-label" title={hint}>
        {label}
      </p>
      <p className={cn("data-metric mt-0.5 text-sm", className)}>{value}</p>
    </div>
  );
}

export function RiskMetricsPanel({ ticker, className }: { ticker: string; className?: string }) {
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    void fetchRiskMetrics(ticker)
      .then((data) => setMetrics(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [ticker]);

  return (
    <div className={cn("terminal-panel", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="panel-label">Risk Metrics</p>
        <Button
          variant="ghost"
          size="xs"
          className="h-5 font-mono text-[9px]"
          onClick={load}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>
      {loading ? (
        <Skeleton className="m-3 h-14" />
      ) : error || !metrics ? (
        <div className="px-3 py-4 text-center">
          <p className="font-mono text-[10px] text-muted-foreground">
            Risk metrics unavailable
          </p>
          <Button variant="outline" size="sm" className="mt-2 h-7 text-[10px]" onClick={load}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap">
          <MetricCell
            label="VaR 95%"
            value={metrics.var_95 != null ? formatPct(metrics.var_95) : "—"}
            hint="1-day historical Value at Risk at 95% confidence"
            className="text-thesis-broken"
          />
          <MetricCell
            label="Sharpe"
            value={metrics.sharpe_ratio != null ? metrics.sharpe_ratio.toFixed(2) : "—"}
            hint="Annualized Sharpe ratio (rf=0)"
            className={
              metrics.sharpe_ratio != null && metrics.sharpe_ratio >= 1
                ? "text-thesis-intact"
                : undefined
            }
          />
          <MetricCell
            label="Max DD"
            value={metrics.max_drawdown != null ? formatPct(metrics.max_drawdown) : "—"}
            hint="Peak-to-trough maximum drawdown"
            className="text-status-degraded"
          />
          <MetricCell
            label={`Beta vs ${metrics.benchmark ?? "SPY"}`}
            value={metrics.beta != null ? metrics.beta.toFixed(2) : "—"}
            hint="Beta relative to benchmark index"
          />
        </div>
      )}
    </div>
  );
}
