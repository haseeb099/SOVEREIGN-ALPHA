"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "@sovereign/shared";
import { fetchMarketCalendar } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EventFilter = "all" | CalendarEvent["type"];

const FILTER_CHIPS: { key: EventFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "earnings", label: "Earnings" },
  { key: "fed", label: "Fed" },
  { key: "macro", label: "Macro" },
];

const TYPE_STYLE: Record<CalendarEvent["type"], string> = {
  earnings: "text-primary",
  fed: "text-status-degraded",
  macro: "text-muted-foreground",
};

export function MacroCalendarPanel({
  ticker,
  days = 30,
  className,
}: {
  ticker: string;
  days?: number;
  className?: string;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventFilter>("all");

  const load = () => {
    setLoading(true);
    void fetchMarketCalendar(ticker, days)
      .then(setEvents)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [ticker, days]);

  const filtered = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    if (filter === "all") return sorted;
    return sorted.filter((e) => e.type === filter);
  }, [events, filter]);

  return (
    <div className={cn("terminal-panel flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="panel-label">Calendar · {days}d</p>
        <div className="flex gap-1">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase transition-colors",
                filter === chip.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <Skeleton className="m-1 h-24" />
        ) : filtered.length === 0 ? (
          <div className="px-2 py-4 text-center">
            <p className="font-mono text-[10px] text-muted-foreground">No upcoming events</p>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-[10px]" onClick={load}>
              Refresh
            </Button>
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((ev) => (
              <li
                key={`${ev.date}-${ev.title}-${ev.type}`}
                className="flex items-start gap-2 rounded border border-border/60 bg-card/40 px-2 py-1.5 font-mono text-[10px]"
              >
                <span className="shrink-0 text-muted-foreground">{ev.date.slice(5)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{ev.title}</p>
                  {ev.source && (
                    <p className="truncate text-[9px] text-muted-foreground">{ev.source}</p>
                  )}
                </div>
                <span className={cn("shrink-0 uppercase text-[9px]", TYPE_STYLE[ev.type])}>
                  {ev.type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
