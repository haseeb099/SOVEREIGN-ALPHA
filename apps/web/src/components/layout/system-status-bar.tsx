"use client";

import { useState } from "react";
import { Activity, AlertTriangle, ChevronDown, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { getApiBase } from "@/lib/api";
import type { HealthResponse } from "@sovereign/shared";
import type { ConnectionStatus } from "@/hooks/use-system-health";
import { formatTimestamp } from "@/lib/format";
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

const USER_LABELS: Record<string, string> = {
  database: "Database",
  redis: "Cache",
  cerebras: "AI Engine",
  newsapi: "News Feed",
  polygon: "Market Data",
  telemetry_ws: "Live Feed",
  api_status: "API status",
  engine: "Engine",
  last_market_fetch: "Last market fetch",
  last_analysis: "Last analysis",
  health_polled: "Health polled",
};

type Subsystem = { status?: string; detail?: string };

function subsystemDisplay(
  key: string,
  sub?: Subsystem,
  wsConnected?: boolean,
): string {
  if (key === "telemetry_ws") {
    if (wsConnected == null) return "Unknown";
    return wsConnected ? "Connected" : "Reconnecting";
  }
  if (!sub?.status) return "Unknown";
  return sub.detail ? `${sub.status} (${sub.detail})` : sub.status;
}

function HealthRow({
  label,
  value,
  unknown,
}: {
  label: string;
  value?: string;
  unknown?: boolean;
}) {
  const isUnknown = unknown !== undefined ? unknown : !value || value === "Unknown";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "flex max-w-[60%] items-center justify-end gap-1 truncate text-right font-mono",
          isUnknown && "text-status-degraded",
        )}
      >
        {isUnknown && <AlertTriangle className="size-3 shrink-0" aria-hidden />}
        {value ?? "Unknown"}
      </span>
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
  showCachedBanner,
}: {
  status: ConnectionStatus;
  health: HealthResponse | null;
  wsConnected: boolean;
  lastFetchAt: Date | null;
  lastAnalysisAt?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  showCachedBanner?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [devDetailsOpen, setDevDetailsOpen] = useState(false);
  const showDevHint = process.env.NODE_ENV === "development";
  const subs = health?.subsystems;
  const wsLive = wsConnected && status !== "offline";
  const offlineBanner = status === "offline" || showCachedBanner;

  const lastMarketFetch =
    typeof subs?.last_market_fetch_at === "number"
      ? new Date(subs.last_market_fetch_at * 1000).toLocaleString()
      : subs?.polygon?.last_fetch_at
        ? String(subs.polygon.last_fetch_at)
        : undefined;

  const healthRows: { devKey: string; value?: string; unknown?: boolean }[] = [
    { devKey: "api_status", value: health?.status, unknown: !health?.status },
    { devKey: "engine", value: "Sovereign AI" },
    { devKey: "database", value: subsystemDisplay("database", subs?.database), unknown: !subs?.database?.status },
    { devKey: "redis", value: subsystemDisplay("redis", subs?.redis), unknown: !subs?.redis?.status },
    { devKey: "cerebras", value: subsystemDisplay("cerebras", subs?.cerebras), unknown: !subs?.cerebras?.status },
    { devKey: "newsapi", value: subsystemDisplay("newsapi", subs?.newsapi), unknown: !subs?.newsapi?.status },
    {
      devKey: "last_market_fetch",
      value: lastMarketFetch,
      unknown: !lastMarketFetch,
    },
    {
      devKey: "last_analysis",
      value: lastAnalysisAt ? formatTimestamp(lastAnalysisAt, { showTz: true }) : undefined,
      unknown: !lastAnalysisAt,
    },
    {
      devKey: "telemetry_ws",
      value: subsystemDisplay("telemetry_ws", undefined, wsConnected),
      unknown: status === "offline" && !wsConnected,
    },
    {
      devKey: "health_polled",
      value: lastFetchAt?.toLocaleTimeString(),
      unknown: !lastFetchAt,
    },
  ];

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 py-1 font-mono text-[10px]">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 border px-2 uppercase transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
              STATUS_STYLES[status],
            )}
            aria-label="System health details"
            title="System health · Alt+T opens tracker"
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
          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="h-6 gap-1 px-1.5 font-mono text-[9px] uppercase"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Retry connection"
            >
              <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
              Retry
            </Button>
          )}
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1 border border-border px-1.5 py-0.5",
            wsLive ? "text-status-live" : "text-muted-foreground",
          )}
          title={wsLive ? "Telemetry WebSocket connected" : "Telemetry WebSocket disconnected"}
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
                : formatTimestamp(lastAnalysisAt, { showTz: true })
              : status === "offline"
                ? "Connecting…"
                : "Ready"}
          </span>
        </div>
      </div>

      {offlineBanner && (
        <div
          className="border-b border-status-degraded/30 bg-status-degraded/10 px-3 py-1.5 text-center text-[11px] text-status-degraded"
          role="status"
        >
          Live data unavailable — showing cached results
        </div>
      )}

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
              </div>
            )}
            {healthRows.map((row) => (
              <HealthRow
                key={row.devKey}
                label={USER_LABELS[row.devKey] ?? row.devKey}
                value={row.value}
                unknown={row.unknown}
              />
            ))}
            {showDevHint && health && (
              <>
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setDevDetailsOpen((v) => !v)}
                >
                  <ChevronDown
                    className={cn("size-3 transition-transform", devDetailsOpen && "rotate-180")}
                  />
                  Developer details
                </button>
                {devDetailsOpen && (
                  <div className="mt-1 border border-border/50 bg-muted/20 p-2 font-mono text-[10px]">
                    <HealthRow label="Model" value={health.model} unknown={!health.model} />
                    <HealthRow label="Provider" value={health.provider} unknown={!health.provider} />
                    <HealthRow label="Redis (raw)" value={subs?.redis?.status} unknown={!subs?.redis?.status} />
                    <HealthRow label="Cerebras (raw)" value={subs?.cerebras?.status} unknown={!subs?.cerebras?.status} />
                    <HealthRow label="Telemetry WS (raw)" value={wsConnected ? "connected" : "disconnected"} />
                  </div>
                )}
              </>
            )}
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                Reconnect
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
