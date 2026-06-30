"use client";

import { useState } from "react";
import { Copy, Download, Mail } from "lucide-react";
import type { AnalyzeResponse } from "@sovereign/shared";
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

export function ShareReportDialog({
  open,
  onOpenChange,
  ticker,
  analysis,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  analysis: AnalyzeResponse;
}) {
  const [loading, setLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const ensureReport = async () => {
    if (shareToken && reportId) {
      return { shareToken, reportId };
    }
    setLoading(true);
    try {
      const report = await generateReport(ticker, analysis);
      setShareToken(report.share_token);
      setReportId(report.id);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share {ticker} report</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => void onCopyLink()}
            disabled={loading}
          >
            <Copy className="size-4" />
            Copy share link
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => void onDownloadPdf()}
            disabled={loading || downloadingPdf}
          >
            <Download className="size-4" />
            {downloadingPdf ? "Downloading…" : "Download PDF"}
          </Button>
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
