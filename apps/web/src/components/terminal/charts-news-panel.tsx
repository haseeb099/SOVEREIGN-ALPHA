"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { MacroEvent } from "@sovereign/shared";
import { fetchTickerNews } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

function sentimentBadgeClass(score: number | undefined) {
  if (score == null) return "text-muted-foreground border-border";
  if (score > 0.15) return "text-thesis-intact border-thesis-intact/40";
  if (score < -0.15) return "text-thesis-broken border-thesis-broken/40";
  return "text-muted-foreground border-border";
}

export function ChartsNewsPanel({ ticker, className }: { ticker: string; className?: string }) {
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [sentimentScore, setSentimentScore] = useState<number | null>(null);
  const [bullishPct, setBullishPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = () => {
    setLoading(true);
    void fetchTickerNews(ticker, 12)
      .then((data) => {
        setEvents(data.events ?? []);
        setSentimentScore(data.ticker_sentiment_score ?? null);
        setBullishPct(data.bullish_pct ?? null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [ticker]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="panel-label">Sentiment</p>
          {sentimentScore != null && (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[9px]",
                sentimentBadgeClass(sentimentScore),
              )}
              title="Aggregate ticker sentiment score (-1 to 1)"
            >
              {sentimentScore > 0 ? "+" : ""}
              {sentimentScore.toFixed(2)}
            </span>
          )}
          {bullishPct != null && (
            <span className="font-mono text-[9px] text-muted-foreground">
              {bullishPct.toFixed(0)}% bull
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="h-5 gap-0.5 font-mono text-[9px]"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          {expanded ? "Collapse" : "Articles"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <Skeleton className="m-1 h-20" />
        ) : events.length === 0 ? (
          <p className="px-2 py-4 text-center font-mono text-[10px] text-muted-foreground">
            No headlines — connect news API in{" "}
            <Link href="/settings" className="text-primary hover:underline">
              Settings
            </Link>
          </p>
        ) : expanded ? (
          <ul className="space-y-1">
            {events.map((ev) => (
              <li
                key={ev.id ?? ev.title}
                className="rounded border border-border/60 bg-card/40 px-2 py-1.5 text-[10px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 leading-relaxed">{ev.title}</p>
                  {ev.sentiment_score != null && (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[9px]",
                        sentimentBadgeClass(ev.sentiment_score),
                      )}
                    >
                      {ev.sentiment_score > 0 ? "+" : ""}
                      {ev.sentiment_score.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9px] text-muted-foreground">
                  {ev.source && <span>{ev.source}</span>}
                  {ev.timestamp && (
                    <span>{formatTimestamp(ev.timestamp, { showTz: false })}</span>
                  )}
                  {ev.url && (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      Source <ExternalLink className="size-2.5" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1">
            {events.slice(0, 4).map((ev) => (
              <li key={ev.id ?? ev.title} className="truncate font-mono text-[10px] text-muted-foreground">
                <span className="text-foreground">{ev.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
