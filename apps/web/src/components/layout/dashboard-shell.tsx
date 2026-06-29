"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { AppNav, MobileBottomNav } from "@/components/layout/app-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardShell({
  title,
  subtitle,
  children,
  onRefresh,
  refreshing,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-background pb-14">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="panel-label">Sovereign-Alpha</p>
            <h1 className="font-mono text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            {onRefresh && (
              <Button
                variant="outline"
                size="xs"
                className="gap-1.5 font-mono text-[10px] uppercase"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                Refresh
              </Button>
            )}
            <AppNav className="hidden lg:flex" />
          </div>
        </div>
      </header>

      <main className={cn("mx-auto max-w-7xl p-4 md:p-5", className)}>{children}</main>
      <MobileBottomNav />
    </div>
  );
}
