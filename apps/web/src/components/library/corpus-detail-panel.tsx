"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Layers, RefreshCw } from "lucide-react";
import type { IngestExtraction } from "@sovereign/shared";
import { fetchCorpus, synthesizeCorpus } from "@/lib/api";
import { classifyFetchError, toastApiError } from "@/lib/api-errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CorpusDetailPanel({
  corpusId,
  onMerged,
}: {
  corpusId: string;
  onMerged?: (merged: IngestExtraction) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [resynthesizing, setResynthesizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchCorpus>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchCorpus(corpusId));
    } catch (e) {
      setError(classifyFetchError(e).message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [corpusId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onResynthesize = async () => {
    setResynthesizing(true);
    try {
      const result = await synthesizeCorpus(corpusId);
      toast.success("Corpus thesis re-synthesized");
      onMerged?.(result.merged_extraction);
      await load();
    } catch (e) {
      toastApiError(e, { message: "Re-synthesis failed" });
    } finally {
      setResynthesizing(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error || !detail) {
    return (
      <Card className="border-status-degraded/40">
        <CardContent className="py-4 text-xs text-muted-foreground">
          {error ?? "Corpus not found"}
          <Button size="sm" variant="link" className="ml-2 h-auto p-0" onClick={() => void load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const merged = detail.merged_extraction;
  const ticker = detail.ticker ?? merged?.ticker_guess ?? "TSLA";
  const thesisCount = merged?.thesis_points?.length ?? 0;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers className="size-4 text-primary" />
          Research corpus
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[10px]"
            onClick={() => void onResynthesize()}
            disabled={resynthesizing}
          >
            <RefreshCw className={cn("size-3", resynthesizing && "animate-spin")} />
            Re-synthesize
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 text-[10px]"
            render={
              <Link href={`/terminal/${ticker}/memo?corpus=${corpusId}`} />
            }
          >
            Run analysis
            <ExternalLink className="size-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{detail.name}</span>
          {detail.ticker && (
            <Badge variant="outline" className="font-mono">
              {detail.ticker}
            </Badge>
          )}
          <Badge variant="secondary">{detail.document_ids.length} documents</Badge>
          {thesisCount > 0 && (
            <Badge variant="outline">{thesisCount} thesis points</Badge>
          )}
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">ID {detail.id}</p>
        {detail.documents.length > 0 && (
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {detail.documents.map((d) => (
              <li key={d.id} className="truncate font-mono">
                {d.filename}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
