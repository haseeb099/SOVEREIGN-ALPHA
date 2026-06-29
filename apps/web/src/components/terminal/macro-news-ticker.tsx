"use client";

import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import type { MacroEvent } from "@sovereign/shared";
import { fetchMacroEvents } from "@/lib/api";
import { useTerminal } from "@/providers/terminal-provider";
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

  useEffect(() => {
    setLoading(true);
    void fetchMacroEvents(ticker)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-stretch border-t border-border bg-card/90",
        className,
      )}
    >
      <div className="flex w-24 shrink-0 items-center gap-1.5 border-r border-border px-2">
        <Newspaper className="size-3 text-primary" />
        <span className="panel-label text-[9px]">Macro</span>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center px-3 text-[10px] text-muted-foreground">
            Loading headlines…
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-full items-center px-3 text-[10px] text-muted-foreground">
            No macro headlines — connect news API for live feed
          </div>
        ) : (
          <div className="flex h-full min-w-0 flex-1 overflow-hidden">
            <div className="macro-ticker-track flex h-full items-center gap-8 px-3">
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
    </div>
  );
}
