"use client";

import { useState } from "react";
import type { AnalyzeResponse } from "@sovereign/shared";
import { unlockReport, getApiBase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FanChart, VerdictCards } from "@/components/terminal/memo-panel";
import { ThesisTrackerPanel } from "@/components/terminal/thesis-tracker-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportData = {
  id: string;
  ticker: string;
  created_at: string;
  analysis: AnalyzeResponse;
  share_token: string;
  password_protected?: boolean;
  template?: string;
  version?: number;
};

export function ReportPasswordGate({
  token,
  initialReport,
  needsPassword,
}: {
  token: string;
  initialReport: ReportData | null;
  needsPassword: boolean;
}) {
  const [unlocked, setUnlocked] = useState(!needsPassword);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(
    needsPassword ? null : initialReport,
  );

  const onUnlock = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await unlockReport(token, password);
      if (!result.unlocked) {
        setError("Invalid password");
        return;
      }
      const headers: Record<string, string> = {};
      if (result.unlock_token) headers["X-Report-Unlock"] = result.unlock_token;
      const res = await fetch(
        `${getApiBase()}/api/reports/${token}`,
        { headers, cache: "no-store" },
      );
      if (!res.ok) {
        setError("Failed to load report after unlock");
        return;
      }
      const data = await res.json();
      setReport({
        id: data.id,
        ticker: data.ticker,
        created_at: data.created_at,
        analysis: data.payload,
        share_token: token,
        template: data.template,
        version: data.version,
      });
      setUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlock failed");
    } finally {
      setLoading(false);
    }
  };

  if (!unlocked || !report) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Password required</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            This report is password-protected. Enter the password shared with you.
          </p>
          <div className="space-y-2">
            <Label htmlFor="unlock-password">Password</Label>
            <Input
              id="unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void onUnlock()}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => void onUnlock()} disabled={loading || !password}>
            {loading ? "Unlocking…" : "Unlock report"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { analysis, ticker } = report;
  const memo = analysis.memo;

  return (
    <>
      {report.version != null && (
        <p className="text-center text-xs text-muted-foreground">
          Version {report.version}
          {report.template ? ` · ${report.template.replace("_", " ")}` : ""}
        </p>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Executive Summary</CardTitle>
          <Badge variant="outline" className="font-mono">
            {memo.rating}
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{memo.summary}</CardContent>
      </Card>
      <FanChart memo={memo} spot={analysis.asset_price} ticker={ticker} />
      <VerdictCards memo={memo} analysis={analysis} />
      <ThesisTrackerPanel points={analysis.thesis_points} ticker={ticker} />
    </>
  );
}
