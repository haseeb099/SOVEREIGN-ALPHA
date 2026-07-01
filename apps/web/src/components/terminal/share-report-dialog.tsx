"use client";

import { useState } from "react";
import { Copy, Download, Mail } from "lucide-react";
import type { AnalyzeResponse, ReportTemplate } from "@sovereign/shared";
import {
  downloadReportPdf,
  generateReport,
  sendReportEmail,
} from "@/lib/api";
import { toastApiError } from "@/lib/api-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const TEMPLATES: { key: ReportTemplate; label: string; description: string }[] = [
  {
    key: "equity_research",
    label: "Equity Research",
    description: "Cover, rating, fan chart, thesis tracker",
  },
  {
    key: "due_diligence",
    label: "Due Diligence",
    description: "Risk-first audit warnings and compliance",
  },
  {
    key: "portfolio_review",
    label: "Portfolio Review",
    description: "Multi-holding summary layout",
  },
  {
    key: "pitch_deck",
    label: "Pitch Deck",
    description: "Slide-style headlines per section",
  },
];

const EXPIRY_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

export function ShareReportDialog({
  open,
  onOpenChange,
  ticker,
  analysis,
  defaultFocus = "share",
  corpusId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  analysis: AnalyzeResponse;
  defaultFocus?: "share" | "export";
  corpusId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [template, setTemplate] = useState<ReportTemplate>("equity_research");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [firmName, setFirmName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [polish, setPolish] = useState(true);

  const ensureReport = async (options?: { forceNewVersion?: boolean }) => {
    if (shareToken && reportId && !options?.forceNewVersion) {
      return { shareToken, reportId };
    }
    setLoading(true);
    try {
      const report = await generateReport(ticker, analysis, {
        template,
        expires_in_days: expiresInDays,
        password: requirePassword && password ? password : undefined,
        polish,
        branding: firmName || logoUrl
          ? { firm_name: firmName || undefined, logo_url: logoUrl || undefined }
          : undefined,
        corpus_id: corpusId ?? undefined,
        parent_report_id:
          options?.forceNewVersion && reportId ? reportId : undefined,
      });
      setShareToken(report.share_token);
      setReportId(report.id);
      setVersion(report.version ?? 1);
      return { shareToken: report.share_token, reportId: report.id };
    } finally {
      setLoading(false);
    }
  };

  const onCopyLink = async () => {
    try {
      const { shareToken: token } = await ensureReport();
      const url = `${window.location.origin}/reports/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (e) {
      toastApiError(e);
    }
  };

  const onDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const { shareToken: token } = await ensureReport();
      const { blob, contentType } = await downloadReportPdf(token);
      const isHtml = contentType.includes("text/html");
      const ext = isHtml ? "html" : "pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticker}-report.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      if (isHtml) {
        toast.warning("PDF unavailable — downloaded HTML report");
      } else {
        toast.success("PDF downloaded");
      }
    } catch (e) {
      toastApiError(e);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const onSendEmail = async () => {
    if (!email.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    try {
      const { reportId: id } = await ensureReport();
      const result = await sendReportEmail(id!, email);
      if (result.status === "deferred") {
        toast.warning(result.detail ?? "Email delivery not configured");
      } else {
        toast.success(`Report sent to ${email}`);
      }
    } catch (e) {
      toastApiError(e, { message: "Email send failed" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {defaultFocus === "export" ? `Export ${ticker} PDF` : `Share ${ticker} report`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTemplate(t.key)}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    template === t.key
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-muted-foreground">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expiry">Link expiry</Label>
              <select
                id="expiry"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-polish" className="flex items-center gap-2">
                <input
                  id="share-polish"
                  type="checkbox"
                  checked={polish}
                  onChange={(e) => setPolish(e.target.checked)}
                />
                AI narrative polish
              </Label>
              <Label htmlFor="share-require-password" className="flex items-center gap-2">
                <input
                  id="share-require-password"
                  type="checkbox"
                  checked={requirePassword}
                  onChange={(e) => setRequirePassword(e.target.checked)}
                />
                Require password
              </Label>
            </div>
          </div>

          {requirePassword && (
            <div className="space-y-2">
              <Label htmlFor="report-password">Share password</Label>
              <Input
                id="report-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Optional access password"
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firm-name">Firm name (branding)</Label>
              <Input
                id="firm-name"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                placeholder="Your firm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo-url">Logo URL</Label>
              <Input
                id="logo-url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          {version != null && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Report version v{version}</p>
              {reportId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px]"
                  disabled={loading}
                  onClick={() => void ensureReport({ forceNewVersion: true }).then(() => toast.success("New version saved"))}
                >
                  Save as new version
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <Button
              variant={defaultFocus === "export" ? "default" : "outline"}
              className="justify-start gap-2"
              onClick={() => void onDownloadPdf()}
              disabled={loading || downloadingPdf}
            >
              <Download className="size-4" />
              {downloadingPdf ? "Downloading…" : "Download PDF"}
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => void onCopyLink()}
              disabled={loading}
            >
              <Copy className="size-4" />
              Copy share link
            </Button>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <Label htmlFor="share-email">Email report</Label>
            <div className="flex gap-2">
              <Input
                id="share-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button onClick={() => void onSendEmail()} disabled={loading}>
                <Mail className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
