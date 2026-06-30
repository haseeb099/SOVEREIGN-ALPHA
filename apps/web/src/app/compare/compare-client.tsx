"use client";

import { useMemo, useRef, useState } from "react";
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
import { classifyFetchError, toastApiError } from "@/lib/api-errors";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { computeThesisHealthPct } from "@/lib/thesis-health";
import { formatPct, formatTimestamp, formatUsd, upsidePct } from "@/lib/format";
import { healthClass, ratingClass } from "@/lib/rating-styles";
import { useRetryWithBackoff } from "@/hooks/use-retry-with-backoff";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
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
  const [tickerChips, setTickerChips] = useState<string[]>(() =>
    initial.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean),
  );
  const [tickerInput, setTickerInput] = useState("");
  const [results, setResults] = useState<AnalyzeResponse[]>([]);
  const [failures, setFailures] = useState<{ ticker: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("sovereign");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(null);
  const [tickerStatuses, setTickerStatuses] = useState<Record<string, "pending" | "done" | "failed">>({});
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopAutoRetryRef = useRef<() => void>(() => {});

  const tickersInput = tickerChips.join(",");

  const addChip = (raw: string) => {
    const upper = raw.trim().toUpperCase();
    if (!upper) return;
    if (tickerChips.length >= 10) {
      toast.error("Up to 10 tickers per compare run");
      return;
    }
    if (!tickerChips.includes(upper)) {
      setTickerChips((c) => [...c, upper]);
    }
    setTickerInput("");
  };

  const runCompare = async (tickers: string[]) => {
    if (!tickers.length) {
      toast.error("Enter at least one ticker");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setFailures([]);
    setHasRun(true);
    setProgress({ done: 0, total: tickers.length, current: tickers[0] });
    const statuses: Record<string, "pending" | "done" | "failed"> = {};
    tickers.forEach((t) => {
      statuses[t] = "pending";
    });
    setTickerStatuses(statuses);
    try {
      const data = await fetchCompareBatch(tickers, controller.signal);
      if (controller.signal.aborted) return;
      const valid: AnalyzeResponse[] = [];
      const failed: { ticker: string; error: string }[] = [];
      for (const r of data.results) {
        if ("memo" in r && !("error" in r)) {
          valid.push(r as AnalyzeResponse);
          const t = (r as AnalyzeResponse).ticker;
          statuses[t] = "done";
        } else {
          const item = r as { ticker?: string; error?: string };
          failed.push({
            ticker: item.ticker ?? "?",
            error: item.error ?? "Analysis failed",
          });
          if (item.ticker) statuses[item.ticker] = "failed";
        }
      }
      setTickerStatuses({ ...statuses });
      setResults(valid);
      setFailures(failed);
      setLastRun(new Date());
      setProgress({ done: tickers.length, total: tickers.length });
      stopAutoRetryRef.current();
      if (valid.length > 0) toast.success(`Compared ${valid.length} asset(s)`);
      if (failed.length > 0) toast.warning(`${failed.length} ticker(s) failed`);
    } catch (e) {
      if (controller.signal.aborted) return;
      const apiError = classifyFetchError(e);
      setError(apiError);
      toastApiError(apiError);
      throw e;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setProgress(null);
      }
    }
  };

  const cancelCompare = () => {
    abortRef.current?.abort();
    setLoading(false);
    setProgress(null);
    toast.info("Compare cancelled");
  };

  const { isRetrying, attempt, nextRetryInMs, retry, stopAutoRetry } =
    useRetryWithBackoff(() => runCompare(tickerChips));
  stopAutoRetryRef.current = stopAutoRetry;

  const exportCsv = () => {
    if (!rows.length) return;
    const header = "ticker,spot,health,target,upside,rating,sovereign,volatility\n";
    const body = rows
      .map(
        (r) =>
          `${r.ticker},${r.asset_price},${r.health},${r.memo.price_target},${r.upside},${r.memo.rating},${r.sovereign_score ?? ""},${r.volatility_30d}`,
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compare-results.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

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
      onRefresh={() => void runCompare(tickerChips)}
      refreshing={loading}
    >
      <div className="flex flex-col gap-6">
        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Assets analyzed"
            value={String(rows.length)}
            hint={
              loading && progress
                ? `${progress.done} of ${progress.total} tickers`
                : failures.length > 0
                  ? `${failures.length} failed`
                  : undefined
            }
            icon={GitCompare}
            loading={loading && rows.length === 0 && hasRun}
            loadingLabel={
              progress ? `Analyzing… ${progress.done}/${progress.total}` : "Analyzing…"
            }
          />
          <KpiCard
            label="Avg thesis health"
            value={avgHealth != null ? `${avgHealth.toFixed(0)}%` : "—"}
            icon={BarChart3}
            loading={loading && rows.length === 0 && hasRun}
            variant={avgHealth != null && avgHealth >= 60 ? "live" : "default"}
          />
          <KpiCard
            label="Avg sovereign score"
            value={avgSovereign != null ? avgSovereign.toFixed(0) : "—"}
            icon={Sparkles}
            loading={loading && rows.length === 0 && hasRun}
          />
          <KpiCard
            label="Bullish ratings"
            value={rows.length > 0 ? `${bullishCount} / ${rows.length}` : "—"}
            icon={TrendingUp}
            loading={loading && rows.length === 0 && hasRun}
            variant={bullishCount > rows.length / 2 ? "live" : "default"}
          />
        </div>

        {/* Search bar */}
        <Card className="border-border/60 bg-card/40">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex min-h-11 flex-1 flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                {tickerChips.map((t) => (
                  <Badge key={t} variant="outline" className="gap-1 font-mono text-[10px]">
                    {t}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${t}`}
                      onClick={() => setTickerChips((c) => c.filter((x) => x !== t))}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
                <Input
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addChip(tickerInput.replace(",", ""));
                    }
                    if (e.key === "Backspace" && !tickerInput && tickerChips.length) {
                      setTickerChips((c) => c.slice(0, -1));
                    }
                  }}
                  onBlur={() => tickerInput && addChip(tickerInput)}
                  placeholder={tickerChips.length ? "Add ticker…" : "TSLA, RIVN — up to 10"}
                  className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
                  aria-label="Ticker input"
                />
              </div>
              {loading ? (
                <Button onClick={cancelCompare} variant="outline" className="min-h-11 min-w-[8rem]">
                  Cancel
                </Button>
              ) : (
                <Button
                  onClick={() => void runCompare(tickerChips)}
                  disabled={loading || tickerChips.length === 0}
                  className="min-h-11 min-w-[8rem]"
                >
                  Run compare
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] text-muted-foreground">Presets:</span>
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  className="h-7 font-mono text-[10px]"
                  title={p.tickers}
                  onClick={() => {
                    const chips = p.tickers.split(",").map((t) => t.trim().toUpperCase());
                    setTickerChips(chips);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {lastRun && (
              <p className="text-[10px] text-muted-foreground">
                Last run {formatTimestamp(lastRun.toISOString(), { showTz: true })}
              </p>
            )}
          </CardContent>
        </Card>

        {loading && Object.keys(tickerStatuses).length > 0 && (
          <ul className="flex flex-wrap gap-2 text-[10px]">
            {Object.entries(tickerStatuses).map(([t, s]) => (
              <li key={t}>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono",
                    s === "done" && "text-status-live",
                    s === "failed" && "text-destructive",
                  )}
                >
                  {t}: {s}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {!hasRun && !loading && (
          <Card className="overflow-hidden border-border/60 bg-card/40">
            <CardContent className="p-0">
              <table className="compare-matrix w-full min-w-[720px] text-left text-xs opacity-60">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Ticker</th>
                    <th className="p-3 font-medium">Spot</th>
                    <th className="p-3 font-medium">Health</th>
                    <th className="p-3 font-medium">12M Target</th>
                    <th className="p-3 font-medium">Upside</th>
                    <th className="p-3 font-medium">Rating</th>
                    <th className="p-3 font-medium">Sovereign</th>
                    <th className="p-3 font-medium">Vol 30d</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      Enter tickers and click Run compare — idle values show as —
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {loading && rows.length === 0 && hasRun && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Analyzing… {progress ? `${progress.done} of ${progress.total} tickers` : ""}
            </p>
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

        {(sorted.length > 0 || failures.length > 0) && (
          <Card className="overflow-hidden border-border/60 bg-card/40">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 py-3">
              <CardTitle className="text-sm font-medium">
                Analysis matrix
                {loading && rows.length > 0 && (
                  <span className="ml-2 font-normal text-muted-foreground">Refreshing…</span>
                )}
              </CardTitle>
              {rows.length > 0 && (
                <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={exportCsv}>
                  Export CSV
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="compare-matrix-scroll overflow-x-auto lg:overflow-visible">
                <table className="compare-matrix w-full min-w-[720px] text-left text-xs lg:min-w-0">
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
                        className="cursor-pointer border-t border-border/40 transition-colors hover:bg-muted/20"
                        onClick={() => setSelectedRow(r)}
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
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className={ratingClass(r.memo.rating)}>
                              {r.memo.rating}
                            </Badge>
                            {r.memo.price_target === 0 && (
                              <Badge variant="outline" className="text-[9px] text-status-degraded">
                                Synthesis failed
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono">
                          {r.sovereign_score != null ? r.sovereign_score.toFixed(0) : "—"}
                        </td>
                        <td className="p-3 text-right font-mono">{r.volatility_30d.toFixed(1)}%</td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
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

        <Sheet open={selectedRow != null} onOpenChange={(open) => !open && setSelectedRow(null)}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            {selectedRow && (
              <>
                <SheetHeader>
                  <SheetTitle className="font-mono">{selectedRow.ticker} preview</SheetTitle>
                </SheetHeader>
                <div className="mt-4 flex flex-col gap-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="panel-label">Spot</p>
                      <p className="font-mono">{formatUsd(selectedRow.asset_price)}</p>
                    </div>
                    <div>
                      <p className="panel-label">12M Target</p>
                      <p className="font-mono">{formatUsd(selectedRow.memo.price_target)}</p>
                    </div>
                    <div>
                      <p className="panel-label">Upside</p>
                      <p className="font-mono">{formatPct(selectedRow.upside)}</p>
                    </div>
                    <div>
                      <p className="panel-label">Thesis Health</p>
                      <p className="font-mono">{selectedRow.health.toFixed(0)}%</p>
                    </div>
                  </div>
                  <div>
                    <p className="panel-label mb-1">Summary</p>
                    <p className="leading-relaxed text-muted-foreground">{selectedRow.memo.summary}</p>
                  </div>
                  <div>
                    <p className="panel-label mb-1">Bull</p>
                    <p className="text-muted-foreground">{selectedRow.memo.bull_verdict}</p>
                  </div>
                  <div>
                    <p className="panel-label mb-1">Bear</p>
                    <p className="text-muted-foreground">{selectedRow.memo.bear_verdict}</p>
                  </div>
                  <Button
                    className="mt-2"
                    render={<Link href={`/terminal/${selectedRow.ticker}/memo`} />}
                  >
                    Open in Terminal
                  </Button>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {!loading && !error && !hasRun && (
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
