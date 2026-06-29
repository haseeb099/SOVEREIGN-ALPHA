"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, FileText, FileUp, Trash2 } from "lucide-react";
import type { IngestExtraction } from "@sovereign/shared";
import { deleteLibraryDocument, fetchLibraryDocuments, ingestDocument } from "@/lib/api";
import { classifyFetchError } from "@/lib/api-errors";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Doc = {
  id: string;
  filename: string;
  ticker_guess?: string;
  tags?: string[];
  uploaded_at?: string;
  created_at?: string;
};

function ExtractionPanel({ extraction }: { extraction: IngestExtraction }) {
  return (
    <Card className="border-status-live/20 bg-status-live/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Latest extraction</CardTitle>
        {extraction.ticker_guess && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-[10px]"
            render={<Link href={`/terminal/${extraction.ticker_guess}/memo`} />}
          >
            Open {extraction.ticker_guess}
            <ExternalLink className="size-3" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {extraction.ticker_guess && (
            <Badge variant="outline" className="font-mono">
              {extraction.ticker_guess}
            </Badge>
          )}
          {extraction.rating && <Badge variant="outline">{extraction.rating}</Badge>}
          {extraction.target_price != null && (
            <Badge variant="outline" className="font-mono">
              Target ${extraction.target_price.toFixed(2)}
            </Badge>
          )}
        </div>
        {extraction.thesis_points && extraction.thesis_points.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
              Thesis points ({extraction.thesis_points.length})
            </h4>
            <ul className="flex flex-col gap-2">
              {extraction.thesis_points.map((tp) => (
                <li key={tp.id} className="rounded-md border border-border/60 px-3 py-2 text-xs">
                  <div className="font-medium">{tp.text}</div>
                  <div className="mt-1 font-mono text-muted-foreground">
                    {tp.metric}
                    {tp.threshold && ` · threshold ${tp.threshold}`}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {extraction.key_risks && extraction.key_risks.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Key risks</h4>
            <ul className="list-inside list-disc text-xs text-muted-foreground">
              {extraction.key_risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LibraryPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [lastExtraction, setLastExtraction] = useState<IngestExtraction | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setDocs(await fetchLibraryDocuments());
    } catch (e) {
      setLoadError(classifyFetchError(e));
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await ingestDocument(file);
      setLastExtraction(result.extraction);
      toast.success(`Ingested ${result.filename}`);
      await refresh();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const thesisDocCount = docs.filter((d) => d.ticker_guess).length;

  return (
    <DashboardShell
      title="Library"
      subtitle="Research documents — extract thesis points and link to terminal"
      onRefresh={() => void refresh()}
      refreshing={loading}
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Documents"
            value={String(docs.length)}
            icon={BookOpen}
            loading={loading}
          />
          <KpiCard
            label="With ticker match"
            value={String(thesisDocCount)}
            hint="Linked to a symbol"
            icon={FileText}
            loading={loading}
          />
          <KpiCard
            label="Latest extraction"
            value={lastExtraction?.ticker_guess ?? "—"}
            hint={
              lastExtraction?.thesis_points?.length
                ? `${lastExtraction.thesis_points.length} thesis points`
                : "Upload to extract"
            }
            loading={false}
            variant={lastExtraction ? "live" : "default"}
          />
        </div>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm">Upload research</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-6 text-sm text-muted-foreground transition-colors hover:bg-primary/10">
              <FileUp className="size-8 text-primary" />
              <span className="font-medium text-foreground">
                {uploading ? "Uploading…" : "Drop or click to upload"}
              </span>
              <span className="text-[10px]">PDF, TXT, JSON, DOCX</span>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".pdf,.txt,.json,.docx"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                }}
              />
            </Label>
          </CardContent>
        </Card>

        {lastExtraction && <ExtractionPanel extraction={lastExtraction} />}

        <Card className="overflow-hidden border-border/60 bg-card/40">
          <CardHeader className="border-b border-border/40 py-3">
            <CardTitle className="text-sm font-medium">Document registry</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadError != null && !loading && (
              <div className="p-4">
                <ApiErrorState error={loadError} onRetry={() => void refresh()} />
              </div>
            )}
            {loading ? (
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : docs.length === 0 && !loadError ? (
              <div className="p-4">
                <EmptyState
                  title="No library entries yet"
                  description="Upload a research document to extract thesis points, ratings, and price targets."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Filename</th>
                      <th className="p-3 font-medium">Ticker</th>
                      <th className="p-3 font-medium">Uploaded</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr
                        key={d.id}
                        className="border-t border-border/40 transition-colors hover:bg-muted/20"
                      >
                        <td className="p-3 font-medium">{d.filename}</td>
                        <td className="p-3">
                          {d.ticker_guess ? (
                            <Link
                              href={`/terminal/${d.ticker_guess}/memo`}
                              className="font-mono text-primary hover:underline"
                            >
                              {d.ticker_guess}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {(d.uploaded_at || d.created_at) &&
                            new Date(d.uploaded_at ?? d.created_at!).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={async () => {
                              try {
                                await deleteLibraryDocument(d.id);
                                toast.success("Document deleted");
                                await refresh();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Delete failed");
                              }
                            }}
                            aria-label="Delete document"
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
