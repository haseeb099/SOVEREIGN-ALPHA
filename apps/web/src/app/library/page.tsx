"use client";

import { useEffect, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import type { IngestExtraction } from "@sovereign/shared";
import { deleteLibraryDocument, fetchLibraryDocuments, ingestDocument } from "@/lib/api";
import { classifyFetchError } from "@/lib/api-errors";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { AppNav, MobileBottomNav } from "@/components/layout/app-nav";
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
      <CardHeader>
        <CardTitle className="text-base">Extraction Results</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {extraction.ticker_guess && (
            <Badge variant="outline" className="font-mono">
              {extraction.ticker_guess}
            </Badge>
          )}
          {extraction.rating && (
            <Badge variant="outline">{extraction.rating}</Badge>
          )}
          {extraction.target_price != null && (
            <Badge variant="outline" className="font-mono">
              Target ${extraction.target_price.toFixed(2)}
            </Badge>
          )}
        </div>
        {extraction.thesis_points && extraction.thesis_points.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
              Thesis Points ({extraction.thesis_points.length})
            </h4>
            <ul className="flex flex-col gap-2">
              {extraction.thesis_points.map((tp) => (
                <li key={tp.id} className="rounded-md border px-3 py-2 text-xs">
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
            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Key Risks</h4>
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

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setDocs(await fetchLibraryDocuments());
    } catch (e) {
      const apiError = classifyFetchError(e);
      setLoadError(apiError);
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background pb-20">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="font-mono text-lg font-bold">Library</h1>
        <AppNav className="ml-auto hidden lg:flex" />
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40">
              <FileUp />
              {uploading ? "Uploading…" : "PDF, TXT, JSON, DOCX"}
              <input
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {loadError != null && !loading && (
              <ApiErrorState error={loadError} onRetry={() => void refresh()} />
            )}
            {loading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : docs.length === 0 && !loadError ? (
              <EmptyState
                title="No library entries yet"
                description="Upload a PDF, DOCX, TXT, or JSON research document to extract thesis points."
              />
            ) : (
              docs.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span>{d.filename}</span>
                  <div className="flex items-center gap-1">
                    {d.ticker_guess && (
                      <Badge variant="outline" className="font-mono">
                        {d.ticker_guess}
                      </Badge>
                    )}
                    {(d.uploaded_at || d.created_at) && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(d.uploaded_at ?? d.created_at!).toLocaleDateString()}
                      </span>
                    )}
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
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
      <MobileBottomNav />
    </div>
  );
}
