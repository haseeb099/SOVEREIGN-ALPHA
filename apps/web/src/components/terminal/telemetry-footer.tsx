"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronUp } from "lucide-react";
import type { TelemetryEvent } from "@sovereign/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Dev-only log strip — never uses fixed positioning (no overlay on content). */
export function TelemetryFooter({
  events,
  connected,
}: {
  events: TelemetryEvent[];
  connected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    const check = () =>
      setDevMode(localStorage.getItem("sovereign_dev_mode") === "1");
    check();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        const next = localStorage.getItem("sovereign_dev_mode") !== "1";
        localStorage.setItem("sovereign_dev_mode", next ? "1" : "0");
        setDevMode(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const recent = useMemo(
    () => events.slice(-8).reverse(),
    [events],
  );

  if (!devMode) return null;

  return (
    <div className="shrink-0 border-t border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-7 w-full items-center gap-2 px-3 text-[10px] text-muted-foreground hover:bg-muted/40"
      >
        <ChevronUp className={cn("size-3 transition-transform", !expanded && "rotate-180")} />
        <span className="font-mono uppercase">Dev telemetry</span>
        <span className={connected ? "text-status-live" : "text-status-degraded"}>
          {connected ? "WS connected" : "WS reconnecting"}
        </span>
        <span className="ml-auto">{events.length} events</span>
      </button>
      {expanded && (
        <div className="max-h-28 overflow-y-auto border-t border-border/50 px-3 py-1.5 font-mono text-[10px]">
          {recent.length === 0 ? (
            <p className="text-muted-foreground">No events yet</p>
          ) : (
            recent.map((e, i) => (
              <div key={`${e.agent}-${e.ts}-${i}`} className="py-0.5 text-muted-foreground">
                <span className="text-primary/80">[{e.agent}]</span> {e.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
