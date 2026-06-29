"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AnalyzeResponse } from "@sovereign/shared";
import { fetchCompareBatch } from "@/lib/api";
import { classifyFetchError, friendlyOfflineToast } from "@/lib/api-errors";
import { computeThesisHealthPct } from "@/lib/thesis-health";
import { useRetryWithBackoff } from "@/hooks/use-retry-with-backoff";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppNav, MobileBottomNav } from "@/components/layout/app-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function ComparePage() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("tickers") ?? "TSLA,BTC,XAU";
  const [tickersInput, setTickersInput] = useState(initial);
  const [results, setResults] = useState<AnalyzeResponse[]>([]);
  const [failures, setFailures] = useState<{ ticker: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

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
      stopAutoRetry();
      if (failed.length > 0) toast.warning(`${failed.length} ticker(s) failed analysis`);
      if (!data.results.length) {
        toast.warning("No results returned");
      }
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

  return (
    <div className="min-h-dvh bg-background pb-20">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="font-mono text-lg font-bold">Compare</h1>
        <AppNav className="ml-auto hidden lg:flex" />
      </header>

      <main className="mx-auto max-w-5xl p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={tickersInput}
            onChange={(e) => setTickersInput(e.target.value.toUpperCase())}
            placeholder="TSLA,RIVN,NIO"
            className="min-h-11 font-mono"
          />
          <Button
            onClick={() => void runCompare(tickersInput)}
            disabled={loading}
            className="min-h-11"
          >
            {loading ? "Analyzing…" : "Compare"}
          </Button>
        </div>

        {loading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
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

        {!loading && (results.length > 0 || failures.length > 0) && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2">Ticker</th>
                  <th className="p-2">Health</th>
                  <th className="p-2">12M Target</th>
                  <th className="p-2">Rating</th>
                  <th className="p-2">Sovereign</th>
                  <th className="p-2">Vol 30d</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.ticker} className="border-t border-border/60">
                    <td className="p-2 font-mono">{r.ticker}</td>
                    <td className="p-2">{computeThesisHealthPct(r)?.toFixed(0) ?? "—"}%</td>
                    <td className="p-2">${r.memo.price_target.toFixed(2)}</td>
                    <td className="p-2">{r.memo.rating}</td>
                    <td className="p-2">
                      {r.sovereign_score != null ? r.sovereign_score.toFixed(0) : "—"}
                    </td>
                    <td className="p-2">{r.volatility_30d.toFixed(1)}%</td>
                  </tr>
                ))}
                {failures.map((f) => (
                  <tr key={`fail-${f.ticker}`} className="border-t border-destructive/30 bg-destructive/5">
                    <td className="p-2 font-mono">{f.ticker}</td>
                    <td colSpan={5} className="p-2">
                      <Badge variant="outline" className="text-destructive">
                        {f.error}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Multi-ticker matrix</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Enter comma-separated tickers and run batch analyze.
            </CardContent>
          </Card>
        )}
      </main>
      <MobileBottomNav />
    </div>
  );
}
