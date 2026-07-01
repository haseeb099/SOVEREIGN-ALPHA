"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, PanelLeft, PanelRight, Search, Workflow } from "lucide-react";
import dynamic from "next/dynamic";
import type { MacroEvent, MarketSearchResult } from "@sovereign/shared";
import { AppNav, NavDrawerContent } from "@/components/layout/app-nav";
import { LocalSessionBanner } from "@/components/layout/local-session-banner";
import { SystemStatusBar } from "@/components/layout/system-status-bar";
import { KeyboardShortcutsDialog } from "@/components/terminal/keyboard-shortcuts-dialog";
import { LeftSidebar } from "@/components/terminal/left-sidebar";
import { MacroEventConfirmDialog } from "@/components/terminal/macro-event-confirm-dialog";
import { MacroNewsTicker } from "@/components/terminal/macro-news-ticker";
import { RightSidebar } from "@/components/terminal/right-sidebar";
import { TelemetryFooter } from "@/components/terminal/telemetry-footer";
import { WorkflowPanel } from "@/components/terminal/workflow-panel";
import { useTerminalShortcuts } from "@/hooks/use-terminal-shortcuts";
import { useSystemHealth, useTelemetry } from "@/hooks/use-system-health";
import { applyMacroEventToScenario } from "@/lib/macro-inject";
import { fetchMarketSearch } from "@/lib/api";
import { useTerminal } from "@/providers/terminal-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const ClerkAuthSlot = hasClerk
  ? dynamic(
      () => import("@/components/layout/clerk-auth-slot").then((m) => m.ClerkAuthSlot),
      { ssr: false },
    )
  : null;

export function TerminalShell({
  children,
  lastAnalysisAt,
}: {
  children: React.ReactNode;
  lastAnalysisAt?: string | null;
}) {
  const router = useRouter();
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<MacroEvent | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [topSearch, setTopSearch] = useState("");
  const [suggestions, setSuggestions] = useState<MarketSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { health, status, setWsConnected, lastFetchAt, refresh } = useSystemHealth();
  const { events, connected } = useTelemetry();
  const { ticker, scenario, setTicker, applyScenarioField, isCached, onIngestResult, applyWorkflowAnalysis } = useTerminal();

  useEffect(() => {
    setTopSearch(ticker);
  }, [ticker]);

  useEffect(() => {
    setWsConnected(connected);
  }, [connected, setWsConnected]);

  const onMacroEvent = useCallback((event: MacroEvent) => {
    setPendingEvent(event);
    setConfirmOpen(true);
  }, []);

  const confirmMacroEvent = useCallback(() => {
    if (!pendingEvent) return;
    const patch = applyMacroEventToScenario(pendingEvent, scenario);
    for (const [key, value] of Object.entries(patch)) {
      applyScenarioField(key as keyof typeof scenario, value as never);
    }
    toast.info(`Applied: ${pendingEvent.title}`);
    setPendingEvent(null);
  }, [pendingEvent, scenario, applyScenarioField]);

  const navigateTicker = useCallback(
    (symbol: string) => {
      const upper = symbol.trim().toUpperCase();
      if (!upper) return;
      setSearchError(null);
      setTicker(upper);
      setTopSearch(upper);
      setShowSuggestions(false);
      router.push(`/terminal/${upper}/memo`);
    },
    [router, setTicker],
  );

  const onTopSearchChange = (value: string) => {
    const upper = value.toUpperCase();
    setTopSearch(upper);
    setSearchError(null);
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (upper.length < 1) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await fetchMarketSearch(upper);
      setSuggestions(results);
      setSearching(false);
    }, 300);
  };

  const onTopSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSuggestions(false);
      return;
    }
    if (e.key !== "Enter") return;
    const query = topSearch.trim();
    if (!query) return;
    const results = await fetchMarketSearch(query, 5);
    const match = results.find((r) => r.ticker === query) ?? results[0];
    if (match) {
      navigateTicker(match.ticker);
    } else {
      setSearchError(`"${query}" is not a recognized ticker`);
    }
  };

  const toggleScenario = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      setRightOpen((v) => !v);
    } else {
      setRightCollapsed((v) => !v);
    }
  }, []);

  const goToTracker = useCallback(() => {
    router.push(`/terminal/${ticker}/tracker`);
  }, [router, ticker]);

  const goToCharts = useCallback(() => {
    router.push(`/terminal/${ticker}/charts`);
  }, [router, ticker]);

  useTerminalShortcuts({
    onToggleScenario: toggleScenario,
    onShowShortcuts: () => setShortcutsOpen(true),
    onGoToTracker: goToTracker,
    onGoToCharts: goToCharts,
  });

  const handleHealthRefresh = () => {
    setHealthRefreshing(true);
    void refresh().finally(() => setHealthRefreshing(false));
  };

  return (
    <div className="terminal-root flex h-dvh flex-col overflow-hidden bg-background pb-safe">
      <header className="terminal-topbar flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2 sm:gap-3">
        <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
          <Link
            href="/terminal"
            className="font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="SA, Sovereign Alpha home"
            title="Sovereign Alpha — Investment Terminal"
          >
            SA
          </Link>
          <span className="hidden text-muted-foreground md:inline">|</span>
          <span className="hidden text-[11px] text-muted-foreground md:inline">
            Investment Terminal
          </span>
        </div>

        <div className="relative min-w-0 max-w-[8rem] flex-1 sm:max-w-[12rem]">
          <Search className="absolute top-2 left-2 size-3 text-muted-foreground" aria-hidden />
          <Input
            value={topSearch}
            onChange={(e) => onTopSearchChange(e.target.value)}
            onKeyDown={(e) => void onTopSearchKeyDown(e)}
            onFocus={() => topSearch.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={ticker}
            className={cn("h-7 pl-7 font-mono text-[11px]", searchError && "border-destructive")}
            aria-label="Ticker search"
            aria-invalid={!!searchError}
            aria-describedby={searchError ? "ticker-search-error" : undefined}
          />
          {showSuggestions && (searching || suggestions.length > 0) && (
            <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover shadow-lg">
              {searching && (
                <div className="p-2 text-[10px] text-muted-foreground">Searching…</div>
              )}
              {suggestions.map((s) => (
                <button
                  key={s.ticker}
                  type="button"
                  className="flex w-full flex-col px-2 py-1.5 text-left text-[10px] hover:bg-muted"
                  onMouseDown={() => navigateTicker(s.ticker)}
                >
                  <span className="font-mono font-semibold">{s.ticker}</span>
                  {s.name && <span className="truncate text-muted-foreground">{s.name}</span>}
                </button>
              ))}
            </div>
          )}
          {searchError && (
            <p id="ticker-search-error" className="absolute top-full mt-0.5 text-[9px] text-destructive">
              {searchError}
            </p>
          )}
        </div>

        <AppNav className="hidden md:flex" />

        {hasClerk && ClerkAuthSlot && (
          <div className="hidden sm:flex">
            <ClerkAuthSlot />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 md:hidden">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-7"
            aria-label="Watchlist"
            title="Watchlist"
            onClick={() => setLeftOpen(true)}
          >
            <PanelLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-7"
            aria-label="Scenario lab"
            title="Scenario lab"
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
          variant="outline"
          size="sm"
          className="hidden h-7 gap-1 px-2 font-mono text-[10px] uppercase md:flex"
          onClick={() => setWorkflowOpen(true)}
          aria-label="Run due diligence workflow"
        >
          <Workflow className="size-3" aria-hidden />
          Run DD
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="hidden h-7 px-2 text-[10px] text-muted-foreground md:flex"
          onClick={() => setShortcutsOpen(true)}
          aria-label="Keyboard shortcuts"
        >
          <kbd className="mr-1 rounded border border-border bg-muted/50 px-1 font-mono text-[9px]">?</kbd>
          Shortcuts
        </Button>
      </header>

      <LocalSessionBanner />
      <SystemStatusBar
        status={status}
        health={health}
        wsConnected={connected}
        lastFetchAt={lastFetchAt}
        lastAnalysisAt={lastAnalysisAt}
        onRefresh={handleHealthRefresh}
        refreshing={healthRefreshing}
        showCachedBanner={isCached}
      />

      <div className="terminal-workspace min-h-0 flex-1">
        <aside className="terminal-col-left hidden min-h-0 xl:flex">
          <LeftSidebar
            collapsed={false}
            onToggle={() => {}}
            showCollapse={false}
            onIngestResult={onIngestResult}
          />
        </aside>

        <main className="terminal-col-center flex min-h-0 min-w-0 flex-col overflow-hidden">
          {children}
        </main>

        <aside className="terminal-col-right hidden min-h-0 xl:flex">
          <RightSidebar
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed((v) => !v)}
          />
        </aside>
      </div>

      <MacroNewsTicker onSelectEvent={onMacroEvent} />
      <TelemetryFooter events={events} connected={connected} />

      <MacroEventConfirmDialog
        event={pendingEvent}
        scenario={scenario}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmMacroEvent}
      />

      <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
        <SheetContent side="left" className="w-[min(100vw,280px)] p-0" showCloseButton>
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="panel-label">Watchlist</SheetTitle>
          </SheetHeader>
          <LeftSidebar
            collapsed={false}
            onToggle={() => setLeftOpen(false)}
            onTickerSelect={() => setLeftOpen(false)}
            onIngestResult={onIngestResult}
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
          <NavDrawerContent className="mt-2" onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <Sheet open={workflowOpen} onOpenChange={setWorkflowOpen}>
        <SheetContent side="right" className="w-[min(100vw,360px)] p-0" showCloseButton>
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="panel-label">Due Diligence Workflow</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-3rem)] overflow-y-auto">
            <WorkflowPanel
              ticker={ticker}
              scenario={scenario}
              onAnalysisReady={(analysis) => {
                applyWorkflowAnalysis(analysis);
                if (analysis.ticker !== ticker) {
                  setTicker(analysis.ticker);
                }
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
