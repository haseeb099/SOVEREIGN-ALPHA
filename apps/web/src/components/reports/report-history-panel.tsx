"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { GitCompare, History, Lock, RefreshCw } from "lucide-react";
import { fetchReportHistory } from "@/lib/api";
import { classifyFetchError, toastApiError } from "@/lib/api-errors";
import { ReportDiffViewer } from "@/components/reports/report-diff-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ReportVersion = {
  id: string;
  version: number;
  template: string;
  share_token: string;
  created_at: string;
  expires_at?: string;
  password_protected: boolean;
};

export function ReportHistoryPanel({
  defaultTicker = "TSLA",
}: {
  defaultTicker?: string;
}) {
  const [ticker, setTicker] = useState(defaultTicker.toUpperCase());
  const [queryTicker, setQueryTicker] = useState(defaultTicker.toUpperCase());
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareFrom, setCompareFrom] = useState<string | null>(null);
  const [compareTo, setCompareTo] = useState<string | null>(null);

  const loadHistory = useCallback(async (symbol: string) => {
    const upper = symbol.trim().toUpperCase();
    if (!upper) return;
    setLoading(true);
    setError(null);
    setCompareFrom(null);
    setCompareTo(null);
    try {
      const data = await fetchReportHistory(upper);
      setVersions(data.versions ?? []);
      setQueryTicker(upper);
      if (!data.versions?.length) {
        setError(`No saved reports for ${upper} yet. Generate one from the memo Share dialog.`);
      }
    } catch (e) {
      const err = classifyFetchError(e);
      setError(err.message);
      setVersions([]);
      toastApiError(err, { message: "Could not load report history." });
    } finally {
      setLoading(false);
    }
  }, []);

  const onCompareLatest = () => {
    if (versions.length < 2) return;
    const sorted = [...versions].sort((a, b) => a.version - b.version);
    setCompareFrom(sorted[0]!.id);
    setCompareTo(sorted[sorted.length - 1]!.id);
  };

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/40 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <History className="size-4 text-primary" />
          Report version history
        </CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="report-history-ticker" className="sr-only">
              Ticker
            </Label>
            <Input
              id="report-history-ticker"
              className="h-8 w-24 font-mono text-xs"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && void loadHistory(ticker)}
              placeholder="TSLA"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={() => void loadHistory(ticker)}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Load
          </Button>
          {versions.length >= 2 && (
            <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={onCompareLatest}>
              <GitCompare className="size-3.5" />
              Compare oldest ↔ newest
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        {loading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!loading && error && versions.length === 0 && (
          <p className="text-xs text-muted-foreground">{error}</p>
        )}

        {!loading && versions.length > 0 && (
          <>
            <p className="text-[10px] text-muted-foreground">
              {queryTicker} · {versions.length} version{versions.length === 1 ? "" : "s"} — select
              two rows to diff, or open a share link.
            </p>
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Ver</th>
                    <th className="p-2 font-medium">Template</th>
                    <th className="p-2 font-medium">Created</th>
                    <th className="p-2 font-medium">Compare</th>
                    <th className="p-2 font-medium">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr
                      key={v.id}
                      className={cn(
                        "border-t border-border/40",
                        (compareFrom === v.id || compareTo === v.id) && "bg-primary/10",
                      )}
                    >
                      <td className="p-2 font-mono">v{v.version}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-[9px] font-normal">
                          {v.template.replace(/_/g, " ")}
                        </Badge>
                        {v.password_protected && (
                          <Lock className="ml-1 inline size-3 text-muted-foreground" aria-label="Password protected" />
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={compareFrom === v.id ? "default" : "outline"}
                            className="h-6 px-2 text-[9px]"
                            onClick={() => setCompareFrom(v.id)}
                          >
                            From
                          </Button>
                          <Button
                            size="sm"
                            variant={compareTo === v.id ? "default" : "outline"}
                            className="h-6 px-2 text-[9px]"
                            onClick={() => setCompareTo(v.id)}
                          >
                            To
                          </Button>
                        </div>
                      </td>
                      <td className="p-2">
                        <Link
                          href={`/reports/${v.share_token}`}
                          className="font-mono text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {compareFrom && compareTo && compareFrom !== compareTo && (
              <div className="space-y-2 border-t border-border/40 pt-4">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <GitCompare className="size-4" />
                  Version diff
                </h3>
                <ReportDiffViewer fromId={compareFrom} toId={compareTo} />
              </div>
            )}

            {compareFrom && compareTo && compareFrom === compareTo && (
              <p className="text-xs text-status-degraded">Select two different versions to compare.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
