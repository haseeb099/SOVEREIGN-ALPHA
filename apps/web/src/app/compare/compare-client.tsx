"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  ExternalLink,
  GitCompare,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { AnalyzeResponse } from "@sovereign/shared";
import { fetchCompareBatch } from "@/lib/api";
import { classifyFetchError, friendlyOfflineToast } from "@/lib/api-errors";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { computeThesisHealthPct } from "@/lib/thesis-health";
import { formatPct, formatUsd, upsidePct } from "@/lib/format";
import { healthClass, ratingClass } from "@/lib/rating-styles";
import { useRetryWithBackoff } from "@/hooks/use-retry-with-backoff";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRESETS = [
  { label: "Core", tickers: "TSLA,BTC,XAU" },
  { label: "EV Peers", tickers: "TSLA,RIVN,NIO,LCID" },
  { label: "Mag 7", tickers: "AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA" },
  { label: "Macro", tickers: "BTC,XAU,EUR,SPY" },
] as const;

type SortKey =
  | "ticker"
  | "health"
  | "target"
  | "upside"
  | "rating"
  | "sovereign"
  | "volatility";

type Row = AnalyzeResponse & { health: number; upside: number };

function SortHeader({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("p-3 font-medium", className)}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-left hover:text-foreground"
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

export default function ComparePage() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("tickers") ?? "TSLA,BTC,XAU";
  const [tickersInput, setTickersInput] = useState(initial);
  const [results, setResults] = useState<AnalyzeResponse[]>([]);
  const [failures, setFailures] = useState<{ ticker: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("sovereign");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runCompare = async (raw: string) => {
    const tickers = raw
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (!tickers.length) {
      toast.error("Enter at least one ticker");
      return;
    }
    setLoading(true);
    setError(null);
    setFailures([]);
    try {
      const data = await fetchCompareBatch(tickers);
      const valid: AnalyzeResponse[] = [];
      const failed: { ticker: string; error: string }[] = [];
      for (const r of data.results) {
        if ("memo" in r && !("error" in r)) {
          valid.push(r as AnalyzeResponse);
        } else {
          const item = r as { ticker?: string; error?: string };
          failed.push({
            ticker: item.ticker ?? "?",
            error: item.error ?? "Analysis failed",
          });
        }
      }
      setResults(valid);
      setFailures(failed);
      setLastRun(new Date());
      stopAutoRetry();
      if (valid.length > 0) toast.success(`Compared ${valid.length} asset(s)`);
      if (failed.length > 0) toast.warning(`${failed.length} ticker(s) failed`);
    } catch (e) {
      const apiError = classifyFetchError(e);
      setError(apiError);
      toast.error(
        apiError.kind === "offline" ? friendlyOfflineToast() : apiError.message,
      );
      setResults([]);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const { isRetrying, attempt, nextRetryInMs, retry, startAutoRetry, stopAutoRetry } =
    useRetryWithBackoff(() => runCompare(tickersInput));

  useEffect(() => {
    void runCompare(initial).catch(() => startAutoRetry());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: Row[] = useMemo(
    () =>
      results.map((r) => ({
        ...r,
        health: computeThesisHealthPct(r) ?? 0,
        upside: upsidePct(r.asset_price, r.memo.price_target),
      })),
    [results],
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortKey) {
        case "ticker":
          return a.ticker.localeCompare(b.ticker) * dir;
        case "health":
          return (a.health - b.health) * dir;
        case "target":
          return (a.memo.price_target - b.memo.price_target) * dir;
        case "upside":
          return (a.upside - b.upside) * dir;
        case "rating":
          return a.memo.rating.localeCompare(b.memo.rating) * dir;
        case "sovereign":
          return ((a.sovereign_score ?? 0) - (b.sovereign_score ?? 0)) * dir;
        case "volatility":
          return (a.volatility_30d - b.volatility_30d) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const avgHealth =
    rows.length > 0 ? rows.reduce((s, r) => s + r.health, 0) / rows.length : null;
  const avgSovereign =
    rows.length > 0
      ? rows.reduce((s, r) => s + (r.sovereign_score ?? 0), 0) / rows.length
      : null;
  const bullishCount = rows.filter((r) => r.memo.rating === "BULLISH").length;

  return (
    <DashboardShell
      title="Compare"
      subtitle="Multi-asset thesis matrix — batch analyze and rank opportunities"
      onRefresh={() => void runCompare(tickersInput)}
      refreshing={loading}
    >
      <div className="flex flex-col gap-6">
        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Assets analyzed"
            value={String(rows.length)}
            hint={failures.length > 0 ? `${failures.length} failed` : undefined}
            icon={GitCompare}
            loading={loading && rows.length === 0}
          />
          <KpiCard
            label="Avg thesis health"
            value={avgHealth != null ? `${avgHealth.toFixed(0)}%` : "—"}
            icon={BarChart3}
            loading={loading && rows.length === 0}
            variant={avgHealth != null && avgHealth >= 60 ? "live" : "default"}
          />
          <KpiCard
            label="Avg sovereign score"
            value={avgSovereign != null ? avgSovereign.toFixed(0) : "—"}
            icon={Sparkles}
            loading={loading && rows.length === 0}
          />
          <KpiCard
            label="Bullish ratings"
            value={rows.length > 0 ? `${bullishCount} / ${rows.length}` : "—"}
            icon={TrendingUp}
            loading={loading && rows.length === 0}
            variant={bullishCount > rows.length / 2 ? "live" : "default"}
          />
        </div>

        {/* Search bar */}
        <Card className="border-border/60 bg-card/40">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={tickersInput}
                onChange={(e) => setTickersInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && void runCompare(tickersInput)}
                placeholder="TSLA,RIVN,NIO — comma-separated"
                className="min-h-11 flex-1 font-mono"
              />
              <Button
                onClick={() => void runCompare(tickersInput)}
                disabled={loading}
                className="min-h-11 min-w-[8rem]"
              >
                {loading ? "Analyzing…" : "Run compare"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] text-muted-foreground">Presets:</span>
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  className="h-7 font-mono text-[10px]"
                  onClick={() => {
                    setTickersInput(p.tickers);
                    void runCompare(p.tickers);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {lastRun && (
              <p className="text-[10px] text-muted-foreground">
                Last run {lastRun.toLocaleTimeString()}
              </p>
            )}
          </CardContent>
        </Card>

        {loading && rows.length === 0 && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!loading && error != null && (
          <ApiErrorState
            error={error}
            onRetry={() => void retry()}
            isRetrying={isRetrying}
            retryAttempt={attempt}
            nextRetryInMs={nextRetryInMs}
          />
        )}

        {!loading && (sorted.length > 0 || failures.length > 0) && (
          <Card className="overflow-hidden border-border/60 bg-card/40">
            <CardHeader className="border-b border-border/40 py-3">
              <CardTitle className="text-sm font-medium">Analysis matrix</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <SortHeader
                        label="Ticker"
                        active={sortKey === "ticker"}
                        direction={sortDir}
                        onClick={() => toggleSort("ticker")}
                      />
                      <th className="p-3 font-medium">Spot</th>
                      <SortHeader
                        label="Health"
                        active={sortKey === "health"}
                        direction={sortDir}
                        onClick={() => toggleSort("health")}
                      />
                      <SortHeader
                        label="12M Target"
                        active={sortKey === "target"}
                        direction={sortDir}
                        onClick={() => toggleSort("target")}
                      />
                      <SortHeader
                        label="Upside"
                        active={sortKey === "upside"}
                        direction={sortDir}
                        onClick={() => toggleSort("upside")}
                      />
                      <SortHeader
                        label="Rating"
                        active={sortKey === "rating"}
                        direction={sortDir}
                        onClick={() => toggleSort("rating")}
                      />
                      <SortHeader
                        label="Sovereign"
                        active={sortKey === "sovereign"}
                        direction={sortDir}
                        onClick={() => toggleSort("sovereign")}
                      />
                      <SortHeader
                        label="Vol 30d"
                        active={sortKey === "volatility"}
                        direction={sortDir}
                        onClick={() => toggleSort("volatility")}
                        className="text-right"
                      />
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr
                        key={r.ticker}
                        className="border-t border-border/40 transition-colors hover:bg-muted/20"
                      >
                        <td className="p-3 font-mono font-semibold">{r.ticker}</td>
                        <td className="p-3 font-mono">{formatUsd(r.asset_price)}</td>
                        <td className={cn("p-3 font-mono font-medium", healthClass(r.health))}>
                          {r.health.toFixed(0)}%
                        </td>
                        <td className="p-3 font-mono">{formatUsd(r.memo.price_target)}</td>
                        <td
                          className={cn(
                            "p-3 font-mono",
                            r.upside >= 0 ? "text-thesis-intact" : "text-thesis-broken",
                          )}
                        >
                          {formatPct(r.upside)}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={ratingClass(r.memo.rating)}>
                            {r.memo.rating}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono">
                          {r.sovereign_score != null ? r.sovereign_score.toFixed(0) : "—"}
                        </td>
                        <td className="p-3 text-right font-mono">{r.volatility_30d.toFixed(1)}%</td>
                        <td className="p-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-[10px]"
                            render={<Link href={`/terminal/${r.ticker}/memo`} />}
                          >
                            Terminal
                            <ExternalLink className="size-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {failures.map((f) => (
                      <tr
                        key={`fail-${f.ticker}`}
                        className="border-t border-destructive/20 bg-destructive/5"
                      >
                        <td className="p-3 font-mono">{f.ticker}</td>
                        <td colSpan={8} className="p-3">
                          <Badge variant="outline" className="text-destructive">
                            {f.error}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !error && rows.length === 0 && failures.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <GitCompare className="size-10 text-muted-foreground" />
              <p className="text-sm font-medium">Multi-ticker compare</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Enter tickers above or pick a preset to run batch AI analysis across your watchlist.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
