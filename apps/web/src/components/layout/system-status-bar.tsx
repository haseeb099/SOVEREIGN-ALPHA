"use client";

import { useState } from "react";
import { Activity, ChevronDown, Radio, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { getApiBase } from "@/lib/api";
import type { HealthResponse } from "@sovereign/shared";
import type { ConnectionStatus } from "@/hooks/use-system-health";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isDataStale, staleDataLabel } from "@/lib/data-freshness";

const STATUS_STYLES: Record<ConnectionStatus, string> = {
  live: "bg-status-live/15 text-status-live border-status-live/30",
  degraded: "bg-status-degraded/15 text-status-degraded border-status-degraded/30",
  offline: "bg-status-offline/15 text-status-offline border-status-offline/30",
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  live: "Live",
  degraded: "Degraded",
  offline: "Offline",
};

function subsystemLabel(
  sub?: { status?: string; detail?: string },
): string {
  if (!sub) return "—";
  return sub.detail ? `${sub.status} (${sub.detail})` : (sub.status ?? "—");
}

function HealthRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-right font-mono">{value ?? "—"}</span>
    </div>
  );
}

export function SystemStatusBar({
  status,
  health,
  wsConnected,
  lastFetchAt,
  lastAnalysisAt,
  onRefresh,
  refreshing,
}: {
  status: ConnectionStatus;
  health: HealthResponse | null;
  wsConnected: boolean;
  lastFetchAt: Date | null;
  lastAnalysisAt?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const showDevHint = process.env.NODE_ENV === "development";
  const subs = health?.subsystems;
  const wsLive = wsConnected && status !== "offline";

  const lastMarketFetch =
    typeof subs?.last_market_fetch_at === "number"
      ? new Date(subs.last_market_fetch_at * 1000).toLocaleString()
      : subs?.polygon?.last_fetch_at
        ? String(subs.polygon.last_fetch_at)
        : undefined;

  return (
    <div className="flex items-center gap-2 border-b border-border/60 bg-card/40 px-3 py-1.5 text-xs backdrop-blur">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className={cn("h-7 gap-1.5 border font-mono text-[11px]", STATUS_STYLES[status])}
          render={<Button variant="outline" size="sm" />}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {STATUS_LABEL[status]}
          <ChevronDown />
        </SheetTrigger>
        <SheetContent side="top" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>System Health</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            {!health && status === "offline" && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <p className="font-medium text-destructive">Connecting to Sovereign</p>
                <p className="mt-1 text-muted-foreground">
                  We&apos;re setting things up — live data will resume shortly.
                </p>
                {showDevHint && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {getApiBase()}
                  </p>
                )}
                {onRefresh && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={onRefresh}
                    disabled={refreshing}
                  >
                    <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
                    Retry now
                  </Button>
                )}
              </div>
            )}
            <HealthRow label="API status" value={health?.status} />
            <HealthRow label="AI Engine" value="Sovereign AI" />
            {showDevHint && (
              <>
                <HealthRow label="Model (dev)" value={health?.model} />
                <HealthRow label="Provider (dev)" value={health?.provider} />
              </>
            )}
            <HealthRow label="Database" value={subsystemLabel(subs?.database)} />
            <HealthRow label="Redis" value={subsystemLabel(subs?.redis)} />
            <HealthRow label="Polygon" value={subsystemLabel(subs?.polygon)} />
            <HealthRow label="Cerebras" value={subsystemLabel(subs?.cerebras)} />
            <HealthRow label="News API" value={subsystemLabel(subs?.newsapi)} />
            <HealthRow label="Last market fetch" value={lastMarketFetch} />
            <HealthRow
              label="Degraded reason"
              value={health?.degraded_reason ?? undefined}
            />
            <HealthRow
              label="Health polled"
              value={lastFetchAt?.toLocaleTimeString()}
            />
            <HealthRow label="Last analysis" value={lastAnalysisAt ?? undefined} />
            <HealthRow
              label="Telemetry WS"
              value={wsConnected ? "Connected (optional)" : "Reconnecting (market data unaffected)"}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Badge
        variant="outline"
        className={cn(
          "hidden gap-1 font-mono sm:flex",
          wsLive
            ? "border-status-live/30"
            : wsConnected && status === "offline"
              ? "border-status-degraded/30"
              : "",
        )}
      >
        {wsLive ? (
          <Wifi className="text-status-live" />
        ) : wsConnected ? (
          <Wifi className="text-status-degraded" />
        ) : (
          <WifiOff className="text-muted-foreground" />
        )}
        <span
          className={cn(
            wsLive
              ? "text-status-live"
              : wsConnected
                ? "text-status-degraded"
                : "text-muted-foreground",
          )}
        >
          WS {wsLive ? "live" : wsConnected ? "idle" : "off"}
        </span>
      </Badge>

      <div className="ml-auto flex items-center gap-2 text-muted-foreground">
        <Activity className="size-3.5" />
        <span className="hidden font-mono md:inline">Sovereign AI</span>
        <Radio className="size-3.5" />
        <span className="font-mono">
          {lastAnalysisAt
            ? isDataStale(lastAnalysisAt)
              ? staleDataLabel(lastAnalysisAt)
              : `Updated ${new Date(lastAnalysisAt).toLocaleTimeString()}`
            : status === "offline"
              ? "Connecting…"
              : "Awaiting analysis"}
        </span>
      </div>
    </div>
  );
}
