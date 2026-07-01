"use client";

import { useEffect, useState } from "react";
import type { MarketDepth } from "@sovereign/shared";
import { fetchMarketDepth } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;

function formatPrice(n: number) {
  return n >= 100 ? n.toFixed(2) : n.toFixed(4);
}

function formatSize(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function OrderBookPanel({ ticker, className }: { ticker: string; className?: string }) {
  const [depth, setDepth] = useState<MarketDepth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const data = await fetchMarketDepth(ticker);
      if (!cancelled) {
        setDepth(data);
        setLoading(false);
      }
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ticker]);

  const bidSize = depth?.bid_size ?? depth?.levels?.find((l) => l.side === "bid")?.size ?? 0;
  const askSize = depth?.ask_size ?? depth?.levels?.find((l) => l.side === "ask")?.size ?? 0;
  const total = bidSize + askSize || 1;
  const bidPct = (bidSize / total) * 100;

  return (
    <div className={cn("terminal-panel flex min-h-0 flex-col", className)}>
      <div className="border-b border-border px-3 py-2">
        <p className="panel-label">Order Book</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {loading && !depth ? (
          <Skeleton className="h-20 w-full" />
        ) : !depth ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            Depth data unavailable — connect Polygon for live bid/ask
          </p>
        ) : depth.bid == null || depth.ask == null ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            Depth data unavailable — connect Polygon for live bid/ask
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
              <div>
                <p className="text-muted-foreground">Bid</p>
                <p className="data-metric text-thesis-intact">{formatPrice(depth.bid)}</p>
                <p className="text-[9px] text-muted-foreground">Size {formatSize(bidSize)}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Ask</p>
                <p className="data-metric text-thesis-broken">{formatPrice(depth.ask)}</p>
                <p className="text-[9px] text-muted-foreground">Size {formatSize(askSize)}</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex h-3 overflow-hidden rounded-sm border border-border">
                <div
                  className="bg-thesis-intact/60 transition-all"
                  style={{ width: `${bidPct}%` }}
                  title={`Bid ${bidPct.toFixed(0)}%`}
                />
                <div
                  className="bg-thesis-broken/60 transition-all"
                  style={{ width: `${100 - bidPct}%` }}
                  title={`Ask ${(100 - bidPct).toFixed(0)}%`}
                />
              </div>
              <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                <span>Spread {depth.spread != null ? formatPrice(depth.spread) : "—"}</span>
                <span>
                  {depth.spread_pct != null ? `${depth.spread_pct.toFixed(3)}%` : "—"}
                </span>
              </div>
            </div>
            {depth.levels && depth.levels.length > 2 && (
              <div className="max-h-24 space-y-0.5 overflow-y-auto font-mono text-[9px]">
                {depth.levels.map((lvl, i) => (
                  <div
                    key={`${lvl.side}-${lvl.price}-${i}`}
                    className={cn(
                      "flex justify-between",
                      lvl.side === "bid" ? "text-thesis-intact" : "text-thesis-broken",
                    )}
                  >
                    <span>{lvl.side.toUpperCase()}</span>
                    <span>{formatPrice(lvl.price)}</span>
                    <span className="text-muted-foreground">{formatSize(lvl.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
