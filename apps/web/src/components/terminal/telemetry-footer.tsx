"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronUp, Filter } from "lucide-react";
import type { TelemetryEvent } from "@sovereign/shared";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function TelemetryFooter({
  events,
  connected,
}: {
  events: TelemetryEvent[];
  connected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    const check = () =>
      setDevMode(
        process.env.NODE_ENV === "development" ||
          localStorage.getItem("sovereign_dev_mode") === "1",
      );
    check();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        const next = localStorage.getItem("sovereign_dev_mode") !== "1";
        localStorage.setItem("sovereign_dev_mode", next ? "1" : "0");
        setDevMode(next || process.env.NODE_ENV === "development");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const agents = useMemo(
    () => Array.from(new Set(events.map((e) => e.agent))).sort(),
    [events],
  );

  const filtered = useMemo(
    () =>
      agentFilter === "all"
        ? events
        : events.filter((e) => e.agent === agentFilter),
    [events, agentFilter],
  );

  if (!devMode) return null;

  return (
    <>
      <div
        className={cn(
          "border-t border-border/60 bg-background/80 backdrop-blur transition-all",
          expanded ? "h-48" : "h-9",
        )}
      >
        <div className="flex h-9 items-center gap-2 px-3 text-[11px]">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2"
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronUp className={cn(!expanded && "rotate-180")} />
            Telemetry
          </Button>
          <span
            className={cn(
              "font-mono",
              connected ? "text-status-live" : "text-status-degraded",
            )}
          >
            {connected ? "WS live" : "WS reconnecting"}
          </span>
          {expanded && (
            <>
              <Filter className="ml-2 size-3.5 text-muted-foreground" />
              <Select value={agentFilter} onValueChange={(v) => v && setAgentFilter(v)}>
                <SelectTrigger className="h-7 w-36 text-[11px]">
                  <SelectValue placeholder="Agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <span className="ml-auto text-muted-foreground">
            {filtered.length} events
          </span>
        </div>
        {expanded && (
          <ScrollArea className="h-[calc(12rem-2.25rem)] px-3 pb-2">
            <div className="flex flex-col gap-0.5 font-mono text-[10px]">
              {filtered
                .slice()
                .reverse()
                .map((e, i) => (
                  <div key={`${e.agent}-${e.ts}-${i}`} className="text-muted-foreground">
                    <span className="text-primary/80">[{e.agent}]</span>{" "}
                    {e.message}
                    {e.ts > 0 && e.ts < 10000 ? (
                      <span className="text-muted-foreground/70"> (+{e.ts}s)</span>
                    ) : null}
                  </div>
                ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Button
        size="icon"
        className="fixed right-4 bottom-20 z-50 shadow-lg lg:hidden"
        onClick={() => setExpanded((v) => !v)}
        aria-label="Toggle telemetry"
      >
        <ChevronUp className={cn(!expanded && "rotate-180")} />
      </Button>
    </>
  );
}
