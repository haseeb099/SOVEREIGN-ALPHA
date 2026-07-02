"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronUp, ExternalLink, Newspaper, Pause, Play, RefreshCw } from "lucide-react";
import type { MacroEvent } from "@sovereign/shared";
import { fetchTickerNews } from "@/lib/api";
import { useTerminal } from "@/providers/terminal-provider";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

function sentimentBadgeClass(score: number | undefined): string {
  if (score == null) return "bg-muted/50 text-muted-foreground";
  if (score > 0.15) return "bg-thesis-intact/20 text-thesis-intact";
  if (score < -0.15) return "bg-thesis-broken/20 text-thesis-broken";
  return "bg-muted/50 text-muted-foreground";
}

function formatSentiment(score: number | undefined): string {
  if (score == null) return "—";
  const pct = Math.round(score * 100);
  return pct > 0 ? `+${pct}` : `${pct}`;
}

export function MacroNewsTicker({
  className,
  onSelectEvent,
}: {
  className?: string;
  onSelectEvent?: (event: MacroEvent) => void;
}) {
  const { ticker } = useTerminal();
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [sentimentScore, setSentimentScore] = useState<number | undefined>();
  const [articles, setArticles] = useState<
    { title: string; source?: string; url?: string; published_at?: string; sentiment_score?: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadEvents = () => {
    setLoading(true);
    setError(false);
    void fetchTickerNews(ticker, 16)
      .then((data) => {
        setEvents(data.events ?? []);
        setSentimentScore(data.ticker_sentiment_score);
        setArticles(
          data.articles && data.articles.length > 0
            ? data.articles
            : (data.events ?? []).map((ev) => ({
                title: ev.title,
                source: ev.source,
                url: ev.url,
                published_at: ev.timestamp,
                sentiment_score: ev.sentiment_score,
              })),
        );
        setFetchedAt(new Date().toISOString());
      })
      .catch(() => {
        setError(true);
        try {
          const cached = sessionStorage.getItem(`sovereign-macro-${ticker}`);
          if (cached) {
            const parsed = JSON.parse(cached) as {
              events: MacroEvent[];
              at: string;
              sentiment?: number;
            };
            setEvents(parsed.events);
            setFetchedAt(parsed.at);
            setSentimentScore(parsed.sentiment);
          } else {
            setEvents([]);
            setArticles([]);
          }
        } catch {
          setEvents([]);
          setArticles([]);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEvents();
  }, [ticker]);

  useEffect(() => {
    if (events.length > 0 && fetchedAt) {
      try {
        sessionStorage.setItem(
          `sovereign-macro-${ticker}`,
          JSON.stringify({ events, at: fetchedAt, sentiment: sentimentScore }),
        );
      } catch {
        /* ignore */
      }
    }
  }, [events, fetchedAt, ticker, sentimentScore]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const staticList = reducedMotion || paused;

  return (
    <div className={cn("relative flex shrink-0 flex-col", className)}>
      {expanded && articles.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-40 max-h-48 overflow-y-auto border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <span className="panel-label text-[9px]">{ticker} headlines</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-5"
              aria-label="Collapse articles"
              onClick={() => setExpanded(false)}
            >
              <ChevronUp className="size-3" />
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {articles.map((article, i) => {
              const Row = article.url ? "a" : "div";
              return (
                <li key={`${article.title}-${i}`}>
                  <Row
                    {...(article.url
                      ? { href: article.url, target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="flex items-start gap-2 px-2 py-1.5 font-mono text-[10px] hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 text-[8px]",
                        sentimentBadgeClass(article.sentiment_score),
                      )}
                    >
                      {formatSentiment(article.sentiment_score)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{article.title}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {article.source}
                        {article.published_at &&
                          ` · ${formatTimestamp(article.published_at, { showTz: false })}`}
                      </p>
                    </div>
                    {article.url && <ExternalLink className="size-3 shrink-0 text-muted-foreground" />}
                  </Row>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex h-8 items-stretch border-t border-border bg-card/90">
        <div className="flex w-28 shrink-0 items-center gap-1.5 border-r border-border px-2">
          <Newspaper className="size-3 text-primary" aria-hidden />
          <span className="panel-label text-[9px]">Macro</span>
          <button
            type="button"
            className={cn(
              "rounded px-1 font-mono text-[8px] tabular-nums",
              sentimentBadgeClass(sentimentScore),
            )}
            title="Ticker sentiment score"
            onClick={() => setExpanded((v) => !v)}
          >
            {formatSentiment(sentimentScore)}
          </button>
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center px-3 text-[10px] text-muted-foreground">
              Loading headlines…
            </div>
          ) : events.length === 0 ? (
            <div className="flex h-full items-center gap-2 px-3 text-[10px] text-muted-foreground">
              <span>No macro headlines — connect news API for live feed</span>
              <Button variant="ghost" size="xs" className="h-5 text-[9px]" onClick={loadEvents}>
                <RefreshCw className="size-3" />
                Retry
              </Button>
              <Link href="/settings" className="text-primary hover:underline">
                Settings
              </Link>
            </div>
          ) : staticList ? (
            <div className="macro-ticker-static flex h-full items-center gap-4 overflow-x-auto px-3">
              {events.map((ev) => (
                <button
                  key={ev.id ?? ev.title}
                  type="button"
                  onClick={() => onSelectEvent?.(ev)}
                  className="flex shrink-0 items-center gap-2 text-left text-[10px] hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-mono text-muted-foreground">
                    {ev.category?.toUpperCase() ?? "EVENT"}
                  </span>
                  <span className="whitespace-nowrap">{ev.title}</span>
                  {ev.impact && (
                    <span className="whitespace-nowrap text-muted-foreground">· {ev.impact}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-w-0 flex-1 overflow-hidden">
              <div
                className="macro-ticker-track flex h-full items-center gap-8 px-3"
                style={{ animationPlayState: paused ? "paused" : "running" }}
              >
                {[...events, ...events, ...events].map((ev, i) => (
                  <button
                    key={`${ev.id ?? ev.title}-${i}`}
                    type="button"
                    onClick={() => onSelectEvent?.(ev)}
                    className="flex shrink-0 items-center gap-2 text-left text-[10px] hover:text-primary"
                  >
                    <span className="font-mono text-muted-foreground">
                      {ev.category?.toUpperCase() ?? "EVENT"}
                    </span>
                    <span className="whitespace-nowrap">{ev.title}</span>
                    {ev.impact && (
                      <span className="whitespace-nowrap text-muted-foreground">· {ev.impact}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center border-l border-border">
          {(error || fetchedAt) && (
            <span className="hidden px-2 text-[9px] text-muted-foreground sm:inline">
              {error ? "Cached" : formatTimestamp(fetchedAt!, { showTz: false })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            aria-label="Refresh macro headlines"
            onClick={loadEvents}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          </Button>
          {!loading && articles.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none border-l border-border"
              aria-label={expanded ? "Collapse articles" : "Expand articles"}
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronUp className={cn("size-3 transition-transform", !expanded && "rotate-180")} />
            </Button>
          )}
          {!loading && events.length > 0 && !reducedMotion && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none border-l border-border"
              aria-label={paused ? "Play ticker" : "Pause ticker"}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
