"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { AppNav, MobileBottomNav } from "@/components/layout/app-nav";
import { SystemStatusBar } from "@/components/layout/system-status-bar";
import { LeftSidebar } from "@/components/terminal/left-sidebar";
import { RightSidebar } from "@/components/terminal/right-sidebar";
import { TelemetryFooter } from "@/components/terminal/telemetry-footer";
import { useSystemHealth, useTelemetry } from "@/hooks/use-system-health";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function TerminalShell({
  children,
  lastAnalysisAt,
}: {
  children: React.ReactNode;
  lastAnalysisAt?: string | null;
}) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const { health, status, setWsConnected, lastFetchAt, refresh } = useSystemHealth();
  const { events, connected } = useTelemetry();

  useEffect(() => {
    setWsConnected(connected);
  }, [connected, setWsConnected]);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border/60 px-3 py-2">
        <div className="font-mono text-sm font-bold tracking-tight">
          SOVEREIGN<span className="text-primary">-ALPHA</span>
        </div>
        <AppNav className="hidden lg:flex" />
        <Sheet>
          <SheetTrigger
            className="md:hidden"
            render={<Button variant="ghost" size="icon-sm" aria-label="Open menu" />}
          >
            <Menu />
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <AppNav className="mt-4 flex-col items-stretch" />
          </SheetContent>
        </Sheet>
      </header>

      <SystemStatusBar
        status={status}
        health={health}
        wsConnected={connected}
        lastFetchAt={lastFetchAt}
        lastAnalysisAt={lastAnalysisAt}
        onRefresh={() => {
          setHealthRefreshing(true);
          void refresh().finally(() => setHealthRefreshing(false));
        }}
        refreshing={healthRefreshing}
      />

      <div className="flex min-h-0 flex-1">
        <div className="hidden lg:flex">
          <LeftSidebar
            collapsed={leftCollapsed}
            onToggle={() => setLeftCollapsed((v) => !v)}
          />
        </div>

        <Sheet>
          <SheetTrigger
            className="fixed top-24 left-2 z-30 lg:hidden"
            render={<Button variant="outline" size="sm" />}
          >
            Assets
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <LeftSidebar collapsed={false} onToggle={() => {}} />
          </SheetContent>
        </Sheet>

        <main className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">{children}</main>

        <div className="hidden lg:flex">
          <RightSidebar
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed((v) => !v)}
          />
        </div>

        <Sheet>
          <SheetTrigger
            className="fixed top-24 right-2 z-30 lg:hidden"
            render={<Button variant="outline" size="sm" />}
          >
            Scenario
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0">
            <RightSidebar collapsed={false} onToggle={() => {}} />
          </SheetContent>
        </Sheet>
      </div>

      <TelemetryFooter events={events} connected={connected} />
      <MobileBottomNav />
    </div>
  );
}
