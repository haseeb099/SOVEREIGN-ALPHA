"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu, PanelLeft, PanelRight } from "lucide-react";
import { DEFAULT_SCENARIO, type MacroEvent, type Scenario } from "@sovereign/shared";
import { AppNav } from "@/components/layout/app-nav";
import { SystemStatusBar } from "@/components/layout/system-status-bar";
import { KeyboardShortcutsDialog } from "@/components/terminal/keyboard-shortcuts-dialog";
import { LeftSidebar } from "@/components/terminal/left-sidebar";
import { MacroNewsTicker } from "@/components/terminal/macro-news-ticker";
import { RightSidebar } from "@/components/terminal/right-sidebar";
import { TelemetryFooter } from "@/components/terminal/telemetry-footer";
import { useTerminalShortcuts } from "@/hooks/use-terminal-shortcuts";
import { useSystemHealth, useTelemetry } from "@/hooks/use-system-health";
import { applyMacroEventToScenario } from "@/lib/macro-inject";
import { useTerminal } from "@/providers/terminal-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";

export function TerminalShell({
  children,
  lastAnalysisAt,
}: {
  children: React.ReactNode;
  lastAnalysisAt?: string | null;
}) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const { health, status, setWsConnected, lastFetchAt, refresh } = useSystemHealth();
  const { events, connected } = useTelemetry();
  const { scenario, applyScenarioField } = useTerminal();

  useEffect(() => {
    setWsConnected(connected);
  }, [connected, setWsConnected]);

  const onMacroEvent = useCallback(
    (event: MacroEvent) => {
      const patch = applyMacroEventToScenario(event, scenario);
      for (const [key, value] of Object.entries(patch)) {
        applyScenarioField(key as keyof typeof scenario, value as never);
      }
      toast.info(`Applied: ${event.title}`);
    },
    [scenario, applyScenarioField],
  );

  const toggleScenario = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      setRightOpen((v) => !v);
    }
  }, []);

  useTerminalShortcuts({
    onToggleScenario: toggleScenario,
    onShowShortcuts: () => setShortcutsOpen(true),
  });

  return (
    <div className="terminal-root flex h-dvh flex-col overflow-hidden bg-background">
      {/* ── Top bar ── */}
      <header className="terminal-topbar flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="font-semibold text-primary">SA</span>
          <span className="hidden text-muted-foreground md:inline">|</span>
          <span className="hidden text-[11px] text-muted-foreground md:inline">
            Investment Terminal
          </span>
        </div>

        <AppNav className="hidden xl:flex" />

        <div className="ml-auto flex items-center gap-1 xl:hidden">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-7"
            aria-label="Watchlist"
            onClick={() => setLeftOpen(true)}
          >
            <PanelLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-7"
            aria-label="Scenario lab"
            onClick={() => setRightOpen(true)}
          >
            <PanelRight className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Menu"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto hidden h-7 px-2 text-[10px] text-muted-foreground xl:ml-0 xl:flex"
          onClick={() => setShortcutsOpen(true)}
        >
          <kbd className="mr-1 rounded border border-border bg-muted/50 px-1 font-mono text-[9px]">?</kbd>
          Shortcuts
        </Button>
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

      {/* ── 3-column workspace ── */}
      <div className="terminal-workspace min-h-0 flex-1">
        <aside className="terminal-col-left hidden min-h-0 xl:flex">
          <LeftSidebar collapsed={false} onToggle={() => {}} showCollapse={false} />
        </aside>

        <main className="terminal-col-center flex min-h-0 min-w-0 flex-col overflow-hidden">
          {children}
        </main>

        <aside className="terminal-col-right hidden min-h-0 xl:flex">
          <RightSidebar collapsed={false} onToggle={() => {}} />
        </aside>
      </div>

      <MacroNewsTicker onSelectEvent={onMacroEvent} />
      <TelemetryFooter events={events} connected={connected} />

      {/* Mobile drawers — mount content only when open */}
      <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
        <SheetContent side="left" className="w-[min(100vw,280px)] p-0" showCloseButton>
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="panel-label">Watchlist</SheetTitle>
          </SheetHeader>
          <LeftSidebar
            collapsed={false}
            onToggle={() => setLeftOpen(false)}
            onTickerSelect={() => setLeftOpen(false)}
            className="h-[calc(100%-3rem)] w-full border-0"
          />
        </SheetContent>
      </Sheet>

      <Sheet open={rightOpen} onOpenChange={setRightOpen}>
        <SheetContent side="right" className="w-[min(100vw,320px)] p-0" showCloseButton>
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="panel-label">Scenario Lab</SheetTitle>
          </SheetHeader>
          <RightSidebar
            collapsed={false}
            onToggle={() => setRightOpen(false)}
            className="h-[calc(100%-3rem)] w-full border-0"
          />
        </SheetContent>
      </Sheet>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle className="panel-label">Navigate</SheetTitle>
          </SheetHeader>
          <AppNav className="mt-4 flex-col items-stretch" />
        </SheetContent>
      </Sheet>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
