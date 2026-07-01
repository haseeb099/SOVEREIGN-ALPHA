"use client";

import { useEffect, useState } from "react";
import type { Holding } from "@sovereign/shared";
import { fetchPortfolioHoldings } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function usePortfolioHolding(ticker: string) {
  const [holding, setHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPortfolioHoldings()
      .then((holdings) => {
        if (cancelled) return;
        const match = holdings.find((h) => h.ticker.toUpperCase() === ticker.toUpperCase());
        setHolding(match ?? null);
      })
      .catch(() => {
        if (!cancelled) setHolding(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return { holding, loading, costBasis: holding?.cost_basis ?? null };
}

export function PortfolioChartOverlay({
  ticker,
  className,
}: {
  ticker: string;
  className?: string;
}) {
  const { holding, loading } = usePortfolioHolding(ticker);

  if (loading) return null;
  if (!holding) return null;

  const pnl = holding.unrealized_pnl;
  const pnlUp = pnl != null && pnl >= 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-3 py-1.5 font-mono text-[10px]",
        className,
      )}
    >
      <Badge variant="outline" className="font-mono text-[9px]">
        In Portfolio
      </Badge>
      <span className="text-muted-foreground">
        {holding.shares.toLocaleString()} sh
      </span>
      {holding.cost_basis != null && (
        <span>
          Cost <span className="text-primary">{formatUsd(holding.cost_basis)}</span>
        </span>
      )}
      {pnl != null && (
        <span className={pnlUp ? "text-thesis-intact" : "text-thesis-broken"}>
          P&L {pnlUp ? "+" : ""}
          {formatUsd(pnl)}
        </span>
      )}
      {holding.weight_pct != null && (
        <span className="text-muted-foreground">{holding.weight_pct.toFixed(1)}% wt</span>
      )}
    </div>
  );
}
