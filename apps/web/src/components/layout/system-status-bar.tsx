"use client";

import { useState } from "react";
import { Activity, ChevronDown, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { getApiBase } from "@/lib/api";
import type { HealthResponse } from "@sovereign/shared";
import type { ConnectionStatus } from "@/hooks/use-system-health";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isDataStale, staleDataLabel } from "@/lib/data-freshness";

const STATUS_STYLES: Record<ConnectionStatus, string> = {
  live: "border-status-live/40 text-status-live",
  degraded: "border-status-degraded/40 text-status-degraded",
  offline: "border-status-offline/40 text-status-offline",
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  live: "LIVE",
  degraded: "DEGRADED",
  offline: "OFFLINE",
};

function subsystemLabel(sub?: { status?: string; detail?: string }): string {
  if (!sub) return "—";
  return sub.detail ? `${sub.status} (${sub.detail})` : (sub.status ?? "—");
}

function HealthRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-2 text-[11px]">
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
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 py-1 font-mono text-[10px]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex h-6 items-center gap-1.5 border px-2 uppercase transition-colors hover:bg-muted/40",
            STATUS_STYLES[status],
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              status === "live" && "bg-status-live",
              status === "degraded" && "bg-status-degraded",
              status === "offline" && "bg-status-offline",
            )}
          />
          {STATUS_LABEL[status]}
          <ChevronDown className="size-3 opacity-60" />
        </button>

        <span
          className={cn(
            "inline-flex items-center gap-1 border border-border px-1.5 py-0.5",
            wsLive ? "text-status-live" : "text-muted-foreground",
          )}
        >
          {wsLive ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
          WS
        </span>

        <div className="ml-auto flex items-center gap-2 truncate text-muted-foreground">
          <Activity className="size-3 shrink-0" />
          <span className="truncate">
            {lastAnalysisAt
              ? isDataStale(lastAnalysisAt)
                ? staleDataLabel(lastAnalysisAt)
                : new Date(lastAnalysisAt).toLocaleTimeString()
              : status === "offline"
                ? "Connecting…"
                : "Ready"}
          </span>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">System Health</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col">
            {!health && status === "offline" && (
              <div className="mb-3 border border-destructive/30 bg-destructive/5 p-3 text-[11px]">
                <p className="font-medium text-destructive">Backend unreachable</p>
                {showDevHint && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {getApiBase()}
                  </p>
                )}
                {onRefresh && (
                  <Button
                    variant="outline"
                    size="xs"
                    className="mt-2 gap-1.5"
                    onClick={onRefresh}
                    disabled={refreshing}
                  >
                    <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                    Retry
                  </Button>
                )}
              </div>
            )}
            <HealthRow label="API status" value={health?.status} />
            <HealthRow label="Engine" value="Sovereign AI" />
            {showDevHint && (
              <>
                <HealthRow label="Model" value={health?.model} />
                <HealthRow label="Provider" value={health?.provider} />
              </>
            )}
            <HealthRow label="Database" value={subsystemLabel(subs?.database)} />
            <HealthRow label="Redis" value={subsystemLabel(subs?.redis)} />
            <HealthRow label="Cerebras" value={subsystemLabel(subs?.cerebras)} />
            <HealthRow label="News API" value={subsystemLabel(subs?.newsapi)} />
            <HealthRow label="Last market fetch" value={lastMarketFetch} />
            <HealthRow label="Last analysis" value={lastAnalysisAt ?? undefined} />
            <HealthRow
              label="Telemetry WS"
              value={wsConnected ? "Connected" : "Reconnecting"}
            />
            <HealthRow label="Health polled" value={lastFetchAt?.toLocaleTimeString()} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
