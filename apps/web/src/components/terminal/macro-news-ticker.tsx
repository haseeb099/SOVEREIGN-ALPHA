"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Newspaper, Pause, Play, RefreshCw } from "lucide-react";
import type { MacroEvent } from "@sovereign/shared";
import { fetchMacroEvents } from "@/lib/api";
import { useTerminal } from "@/providers/terminal-provider";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MacroNewsTicker({
  className,
  onSelectEvent,
}: {
  className?: string;
  onSelectEvent?: (event: MacroEvent) => void;
}) {
  const { ticker } = useTerminal();
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const loadEvents = () => {
    setLoading(true);
    setError(false);
    void fetchMacroEvents(ticker)
      .then((data) => {
        setEvents(data);
        setFetchedAt(new Date().toISOString());
      })
      .catch(() => {
        setError(true);
        try {
          const cached = sessionStorage.getItem(`sovereign-macro-${ticker}`);
          if (cached) {
            const parsed = JSON.parse(cached) as { events: MacroEvent[]; at: string };
            setEvents(parsed.events);
            setFetchedAt(parsed.at);
          } else {
            setEvents([]);
          }
        } catch {
          setEvents([]);
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
          JSON.stringify({ events, at: fetchedAt }),
        );
      } catch {
        /* ignore */
      }
    }
  }, [events, fetchedAt, ticker]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const staticList = reducedMotion || paused;

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-stretch border-t border-border bg-card/90",
        className,
      )}
    >
      <div className="flex w-24 shrink-0 items-center gap-1.5 border-r border-border px-2">
        <Newspaper className="size-3 text-primary" aria-hidden />
        <span className="panel-label text-[9px]">Macro</span>
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
              {[...events, ...events].map((ev, i) => (
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
  );
}
