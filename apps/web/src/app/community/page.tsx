"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { classifyFetchError } from "@/lib/api-errors";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

type CommunityCard = { ticker: string; score: number; summary: string };

export default function CommunityPage() {
  const [cards, setCards] = useState<CommunityCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<{ cards: CommunityCard[] }>("/api/v1/public/community");
      setCards(r.cards ?? []);
    } catch (e) {
      setError(classifyFetchError(e));
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const avgScore =
    cards.length > 0 ? cards.reduce((s, c) => s + c.score, 0) / cards.length : null;

  return (
    <DashboardShell
      title="Community Thesis"
      subtitle="Crowd-sourced research summaries — not investment advice"
      onRefresh={() => void load()}
      refreshing={loading}
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard
            label="Published theses"
            value={String(cards.length)}
            icon={Users}
            loading={loading}
          />
          <KpiCard
            label="Avg community score"
            value={avgScore != null ? avgScore.toFixed(0) : "—"}
            loading={loading}
          />
        </div>

        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        )}

        {!loading && error != null && (
          <ApiErrorState error={error} onRetry={() => void load()} />
        )}

        {!loading && !error && cards.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No community theses yet. Run analyses in the terminal to contribute.
            </CardContent>
          </Card>
        )}

        {!loading && cards.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {cards.map((c) => (
              <Card
                key={c.ticker}
                className="border-border/60 bg-card/40 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-mono text-base">{c.ticker}</CardTitle>
                  <Badge variant="outline" className="font-mono text-status-live">
                    {c.score}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit gap-1"
                    render={<Link href={`/terminal/${c.ticker}/memo`} />}
                  >
                    Open in Terminal
                    <ArrowRight className="size-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
