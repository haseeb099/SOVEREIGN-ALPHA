"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AppNav, AppNavigation, AppWordmark } from "@/components/layout/app-nav";
import { LocalSessionBanner } from "@/components/layout/local-session-banner";
import { SystemStatusBar } from "@/components/layout/system-status-bar";
import { useSystemHealth } from "@/hooks/use-system-health";
import { Button } from "@/components/ui/button";
import { toastApiError } from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function DashboardShell({
  title,
  subtitle,
  children,
  onRefresh,
  refreshing,
  actions,
  className,
  backHref,
  showMobileNav = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  actions?: ReactNode;
  className?: string;
  backHref?: string;
  showMobileNav?: boolean;
}) {
  const { health, status, wsConnected, lastFetchAt, refresh } = useSystemHealth();
  const [healthRefreshing, setHealthRefreshing] = useState(false);

  const handleHealthRefresh = useCallback(() => {
    setHealthRefreshing(true);
    void refresh().finally(() => setHealthRefreshing(false));
  }, [refresh]);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    try {
      await onRefresh();
      toast.success("Data refreshed");
    } catch (e) {
      toastApiError(e);
    }
  }, [onRefresh, refreshing]);

  return (
    <div className="min-h-dvh bg-background pb-14 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        {/* Primary nav toolbar — matches terminal top bar */}
        <div className="mx-auto flex max-w-7xl items-center gap-2 border-b border-border/40 px-3 py-2 sm:gap-3">
          <AppWordmark className="shrink-0 text-xs" />
          <AppNav className="hidden min-w-0 flex-1 md:flex" />
        </div>

        {/* Page context row */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 bg-card/60 px-4 py-2.5">
          <div className="min-w-0">
            <h1 className="font-mono text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {backHref && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 font-mono text-[10px] uppercase"
                render={<Link href={backHref} />}
              >
                <ArrowLeft className="size-3" />
                Back
              </Button>
            )}
            {actions}
            {onRefresh && (
              <Button
                variant="outline"
                size="xs"
                className="gap-1.5 font-mono text-[10px] uppercase"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
              >
                <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                Refresh
              </Button>
            )}
          </div>
        </div>
      </header>

      <LocalSessionBanner />
      <SystemStatusBar
        status={status}
        health={health}
        wsConnected={wsConnected}
        lastFetchAt={lastFetchAt}
        onRefresh={handleHealthRefresh}
        refreshing={healthRefreshing}
      />
      <main className={cn("mx-auto max-w-7xl p-4 md:p-5", className)}>{children}</main>

      <div className={cn(!showMobileNav && "hidden", "md:hidden")}>
        <AppNavigation />
      </div>
    </div>
  );
}
