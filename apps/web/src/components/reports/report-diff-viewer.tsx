"use client";

import { useEffect, useState } from "react";
import { fetchReportDiff } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type DiffData = {
  rating_change?: { from: string; to: string } | null;
  price_target_delta?: { from: number; to: number; delta: number } | null;
  thesis_points?: {
    added: Record<string, unknown>[];
    removed: Record<string, unknown>[];
    changed: { from: Record<string, unknown>; to: Record<string, unknown> }[];
  };
  audit_warnings?: { added: string[]; removed: string[] };
};

export function ReportDiffViewer({
  fromId,
  toId,
}: {
  fromId: string;
  toId: string;
}) {
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchReportDiff(fromId, toId)
      .then((r) => setDiff(r.diff as DiffData))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load diff"))
      .finally(() => setLoading(false));
  }, [fromId, toId]);

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!diff) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {diff.rating_change && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rating</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{diff.rating_change.from ?? "—"}</Badge>
              <span>→</span>
              <Badge>{diff.rating_change.to ?? "—"}</Badge>
            </CardContent>
          </Card>
        )}
        {diff.price_target_delta && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Price target</CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-mono">
              ${diff.price_target_delta.from} → ${diff.price_target_delta.to}
              <span
                className={
                  diff.price_target_delta.delta >= 0 ? "text-green-600" : "text-red-600"
                }
              >
                {" "}
                ({diff.price_target_delta.delta >= 0 ? "+" : ""}
                {diff.price_target_delta.delta})
              </span>
            </CardContent>
          </Card>
        )}
      </div>

      {diff.thesis_points && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Thesis changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {diff.thesis_points.added.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-green-600">Added</p>
                <ul className="list-inside list-disc">
                  {diff.thesis_points.added.map((tp, i) => (
                    <li key={`a-${i}`}>{String(tp.text ?? "")}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.thesis_points.removed.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-red-600">Removed</p>
                <ul className="list-inside list-disc">
                  {diff.thesis_points.removed.map((tp, i) => (
                    <li key={`r-${i}`}>{String(tp.text ?? "")}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.thesis_points.changed.map((c, i) => (
              <div key={`c-${i}`} className="rounded border border-border/60 p-2">
                <p className="text-muted-foreground line-through">{String(c.from.text ?? "")}</p>
                <p className="font-medium">{String(c.to.text ?? "")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {diff.audit_warnings &&
        (diff.audit_warnings.added.length > 0 || diff.audit_warnings.removed.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Audit warnings</CardTitle>
            </CardHeader>
            <CardContent className="text-xs">
              {diff.audit_warnings.added.map((w) => (
                <p key={w} className="text-amber-600">
                  + {w}
                </p>
              ))}
              {diff.audit_warnings.removed.map((w) => (
                <p key={w} className="text-muted-foreground line-through">
                  − {w}
                </p>
              ))}
            </CardContent>
          </Card>
        )}
    </div>
  );
}
