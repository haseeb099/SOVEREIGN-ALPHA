"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, ExternalLink, FileText, FileUp, Trash2, X } from "lucide-react";
import type { IngestExtraction } from "@sovereign/shared";
import { deleteLibraryDocument, fetchLibraryDocuments, ingestDocument, ingestDocumentBatch } from "@/lib/api";
import { authRequiredMessage, ApiError, classifyFetchError, toastApiError } from "@/lib/api-errors";
import { AuthGate } from "@/components/auth/auth-gate";
import { PlanGate } from "@/components/auth/plan-gate";
import { CorpusDetailPanel } from "@/components/library/corpus-detail-panel";
import { ReportHistoryPanel } from "@/components/reports/report-history-panel";
import { useSystemHealth } from "@/hooks/use-system-health";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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
  const searchParams = useSearchParams();
  const previewChunk = searchParams.get("chunk");
  const previewSource = searchParams.get("source");
  const previewDocId = searchParams.get("doc");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [lastExtraction, setLastExtraction] = useState<IngestExtraction | null>(null);
  const [lastCorpusId, setLastCorpusId] = useState<string | null>(null);
  const [pendingBundleFiles, setPendingBundleFiles] = useState<File[]>([]);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: "pending" | "done" | "error" }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { health } = useSystemHealth();

  const cerebrasDown =
    health?.subsystems?.cerebras?.status &&
    health.subsystems.cerebras.status !== "ok" &&
    health.subsystems.cerebras.status !== "online";

  const refresh = async (options?: { suppressErrorToast?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    setAuthError(false);
    try {
      setDocs(await fetchLibraryDocuments());
    } catch (e) {
      const err = classifyFetchError(e);
      if (err.kind === "auth") {
        setAuthError(true);
        setDocs([]);
      } else {
        setLoadError(err);
        setDocs([]);
        if (!options?.suppressErrorToast) {
          toastApiError(err, {
            message: "Document registry is temporarily unavailable.",
          });
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh().catch(() => {});
  }, []);

  const processUploadQueue = async (files: File[]) => {
    const valid = files.filter((f) => {
      if (f.size > MAX_UPLOAD_BYTES) {
        toast.error(`${f.name} exceeds 10 MB limit`);
        return false;
      }
      return true;
    });
    if (!valid.length) return;

    if (valid.length >= 2 && valid.length <= 5) {
      setPendingBundleFiles(valid);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setUploadQueue(valid.map((f) => ({ name: f.name, status: "pending" as const })));
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i]!;
      try {
        const result = await ingestDocument(file);
        setLastExtraction(result.extraction);
        setUploadQueue((q) =>
          q.map((item, idx) => (idx === i ? { ...item, status: "done" } : item)),
        );
        toast.success(`Ingested ${result.filename}`);
      } catch (e) {
        setUploadQueue((q) =>
          q.map((item, idx) => (idx === i ? { ...item, status: "error" } : item)),
        );
        const err = classifyFetchError(e);
        if (err instanceof ApiError && err.status === 409) {
          toast.error(`${file.name} already uploaded`);
        } else {
          toastApiError(err, { message: `Failed: ${file.name}` });
        }
      }
    }
    await refresh();
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(false);
    window.setTimeout(() => setUploadQueue([]), 3000);
  };

  const onUpload = async (file: File) => {
    await processUploadQueue([file]);
  };

  const createResearchBundle = async () => {
    if (pendingBundleFiles.length < 2) return;
    setUploading(true);
    setUploadQueue(
      pendingBundleFiles.map((f) => ({ name: f.name, status: "pending" as const })),
    );
    try {
      const result = await ingestDocumentBatch(pendingBundleFiles);
      setLastCorpusId(result.corpus_id);
      setLastExtraction(result.merged_extraction);
      setUploadQueue((q) => q.map((item) => ({ ...item, status: "done" as const })));
      toast.success(`Research bundle created (${result.document_ids.length} docs)`);
      await refresh();
    } catch (e) {
      toastApiError(e, { message: "Bundle creation failed" });
      setUploadQueue((q) => q.map((item) => ({ ...item, status: "error" as const })));
    } finally {
      setPendingBundleFiles([]);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      window.setTimeout(() => setUploadQueue([]), 3000);
    }
  };

  const uploadPendingIndividually = async () => {
    const files = [...pendingBundleFiles];
    setPendingBundleFiles([]);
    setUploading(true);
    setUploadQueue(files.map((f) => ({ name: f.name, status: "pending" as const })));
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      try {
        const result = await ingestDocument(file);
        setLastExtraction(result.extraction);
        setUploadQueue((q) =>
          q.map((item, idx) => (idx === i ? { ...item, status: "done" } : item)),
        );
        toast.success(`Ingested ${result.filename}`);
      } catch (e) {
        setUploadQueue((q) =>
          q.map((item, idx) => (idx === i ? { ...item, status: "error" } : item)),
        );
        toastApiError(classifyFetchError(e), { message: `Failed: ${file.name}` });
      }
    }
    await refresh();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.setTimeout(() => setUploadQueue([]), 3000);
  };

  const thesisDocCount = docs.filter((d) => d.ticker_guess).length;

  const previewDoc =
    (previewDocId && docs.find((d) => d.id === previewDocId)) ||
    (previewSource
      ? docs.find((d) =>
          d.filename.toLowerCase().includes(previewSource.toLowerCase()) ||
          d.ticker_guess?.toLowerCase() === previewSource.toLowerCase(),
        )
      : undefined);

  const serviceUnavailable =
    loadError instanceof ApiError && loadError.status === 503;

  return (
    <DashboardShell
      title="Library"
      subtitle="Research documents — extract thesis points and link to terminal"
      onRefresh={() => refresh({ suppressErrorToast: true })}
      refreshing={loading}
    >
      <div className="flex flex-col gap-6">
        {cerebrasDown && (
          <Card className="border-status-degraded/40 bg-status-degraded/10">
            <CardContent className="py-3 text-xs text-status-degraded">
              Document extraction unavailable — CEREBRAS_API_KEY is missing or invalid. Text
              uploads require AI extraction; check backend health and .env configuration.
            </CardContent>
          </Card>
        )}
        {serviceUnavailable ? (
          <ApiErrorState error={loadError} onRetry={() => void refresh()} />
        ) : (
        <PlanGate feature="library">
        <AuthGate show={authError}>
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
                : undefined
            }
            loading={false}
            variant={lastExtraction ? "live" : "default"}
          />
        </div>
        {!lastExtraction && (
          <Button
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-xs"
            onClick={() => dropzoneRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            Upload to extract →
          </Button>
        )}

        <div ref={dropzoneRef}>
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
              <span className="text-[10px]">PDF, TXT, JSON, DOCX · max 10 MB</span>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".pdf,.txt,.json,.docx"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) void processUploadQueue(files);
                }}
              />
            </Label>
            {uploading && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-2/3 animate-pulse bg-primary" />
              </div>
            )}
            {uploadQueue.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-[10px]">
                {uploadQueue.map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono">{item.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px]",
                        item.status === "done" && "text-status-live",
                        item.status === "error" && "text-destructive",
                      )}
                    >
                      {item.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </div>

        {pendingBundleFiles.length >= 2 && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-sm">
                Create research bundle ({pendingBundleFiles.length} files)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="text-xs text-muted-foreground">
                {pendingBundleFiles.map((f) => (
                  <li key={f.name} className="font-mono">
                    {f.name}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void createResearchBundle()} disabled={uploading}>
                  Create research bundle
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void uploadPendingIndividually()}
                  disabled={uploading}
                >
                  Upload individually
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingBundleFiles([])}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {lastCorpusId && (
          <CorpusDetailPanel
            corpusId={lastCorpusId}
            onMerged={(merged) => setLastExtraction(merged)}
          />
        )}

        <ReportHistoryPanel defaultTicker={lastExtraction?.ticker_guess ?? "TSLA"} />

        {lastExtraction && <ExtractionPanel extraction={lastExtraction} />}

        {(previewChunk || previewSource || previewDoc) && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-mono">Citation preview</CardTitle>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss preview"
                render={<Link href="/library" />}
              >
                <X className="size-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {previewDoc ? (
                <div className="flex flex-col gap-2">
                  <p className="font-medium text-foreground">{previewDoc.filename}</p>
                  {previewDoc.ticker_guess && (
                    <Link
                      href={`/terminal/${previewDoc.ticker_guess}/memo`}
                      className="font-mono text-primary hover:underline"
                    >
                      Open {previewDoc.ticker_guess} memo
                    </Link>
                  )}
                </div>
              ) : (
                <p>No matching document in registry yet.</p>
              )}
              {previewChunk && (
                <p className="mt-2 font-mono text-[10px]">
                  Chunk: <span className="text-foreground">{previewChunk}</span>
                </p>
              )}
              {previewSource && !previewDoc && (
                <p className="mt-2 font-mono text-[10px]">
                  Source: <span className="text-foreground">{previewSource}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

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
                      <th scope="col" className="p-3 font-medium">
                        Filename
                      </th>
                      <th scope="col" className="p-3 font-medium">
                        Ticker
                      </th>
                      <th scope="col" className="p-3 font-medium">
                        Uploaded
                      </th>
                      <th scope="col" className="p-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr
                        key={d.id}
                        className={cn(
                          "border-t border-border/40 transition-colors hover:bg-muted/20",
                          previewDoc?.id === d.id && "bg-primary/10",
                        )}
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
                            onClick={() => setDeleteTarget(d)}
                            aria-label={`Delete ${d.filename}`}
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
        </AuthGate>
        </PlanGate>
        )}

        <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete document?</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Remove {deleteTarget?.filename} from the registry. This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!deleteTarget) return;
                  try {
                    await deleteLibraryDocument(deleteTarget.id);
                    toast.success("Document deleted");
                    setDeleteTarget(null);
                    await refresh();
                  } catch (e) {
                    toastApiError(e, { message: "Delete failed" });
                  }
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
