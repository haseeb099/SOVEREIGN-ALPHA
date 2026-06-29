"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileUp, PanelLeft, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IngestExtraction, MarketSearchResult } from "@sovereign/shared";
import { useTerminal } from "@/providers/terminal-provider";
import { fetchAssets, fetchMarketSearch, ingestDocument } from "@/lib/api";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { computeThesisHealthPct } from "@/lib/thesis-health";
import { staleDataLabel } from "@/lib/data-freshness";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function LeftSidebar({
  collapsed,
  onToggle,
  className,
  onIngestResult,
  onTickerSelect,
  showCollapse = true,
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  onIngestResult?: (extraction: IngestExtraction) => void;
  onTickerSelect?: () => void;
  showCollapse?: boolean;
}) {
  const router = useRouter();
  const { ticker, setTicker, analysis, isAnalyzing, analyze, lastUpdated } =
    useTerminal();
  const [assets, setAssets] = useState<{ key: string; full_name: string }[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<unknown>(null);
  const [assetsFallback, setAssetsFallback] = useState(false);
  const [search, setSearch] = useState(ticker);
  const [suggestions, setSuggestions] = useState<MarketSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recalcState, setRecalcState] = useState<"idle" | "running" | "done">("idle");

  const loadAssets = useCallback(() => {
    setAssetsLoading(true);
    setAssetsError(null);
    setAssetsFallback(false);
    void fetchAssets()
      .then((d) => {
        setAssets(d.assets);
        if ("fallback" in d && d.fallback) {
          setAssetsFallback(true);
        }
      })
      .catch((e) => {
        setAssetsError(e);
        toast.error("Failed to load asset list");
      })
      .finally(() => setAssetsLoading(false));
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    setSearch(ticker);
  }, [ticker]);

  const selectTicker = useCallback(
    (t: string) => {
      setTicker(t);
      setSearch(t);
      setShowSuggestions(false);
      onTickerSelect?.();
      router.push(`/terminal/${t}/memo`);
    },
    [router, setTicker, onTickerSelect],
  );

  const onSearchChange = (value: string) => {
    const upper = value.toUpperCase();
    setSearch(upper);
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

  const onUpload = async (file: File) => {
    try {
      const result = await ingestDocument(file);
      toast.success(`Ingested ${result.filename}`);
      onIngestResult?.(result.extraction);
      if (result.extraction?.thesis_points?.length) {
        await analyze();
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  if (collapsed) {
    return (
      <div className={cn("flex h-full w-9 flex-col items-center border-r border-border py-2", className)}>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Expand watchlist">
          <PanelLeft />
        </Button>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-r border-border bg-card/60 xl:w-[240px]",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="panel-label">Watchlist</span>
        {showCollapse && (
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse sidebar">
            <PanelLeft />
          </Button>
        )}
      </div>
      <div className="relative px-3 pb-2">
        <Label htmlFor="ticker-search" className="sr-only">
          Search ticker
        </Label>
        <div className="relative">
          <Search className="absolute top-2.5 left-2 size-4 text-muted-foreground" />
          <Input
            id="ticker-search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") selectTicker(search);
              if (e.key === "Escape") setShowSuggestions(false);
            }}
            onFocus={() => search.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="h-8 pl-8 font-mono text-xs"
            placeholder="Search tickers…"
            autoComplete="off"
          />
        </div>
        {showSuggestions && (searching || suggestions.length > 0) && (
          <div className="absolute top-full right-3 left-3 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg">
            {searching && (
              <div className="p-2 text-[11px] text-muted-foreground">Searching…</div>
            )}
            {suggestions.map((s) => (
              <button
                key={s.ticker}
                type="button"
                className="flex w-full flex-col px-2 py-2 text-left text-xs hover:bg-muted"
                onMouseDown={() => selectTicker(s.ticker)}
              >
                <span className="font-mono font-semibold">{s.ticker}</span>
                {s.name && (
                  <span className="truncate text-muted-foreground">{s.name}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-1 pb-2">
          {assetsFallback && (
            <Badge variant="outline" className="mx-1 mb-1 text-[9px] text-status-degraded">
              Offline — showing popular tickers
            </Badge>
          )}
          {assetsError != null && !assetsLoading && assets.length === 0 && (
            <ApiErrorState
              error={assetsError}
              onRetry={loadAssets}
              className="border-0 bg-transparent shadow-none"
            />
          )}
          {assetsLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : (
            assets.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => selectTicker(a.key)}
                className={cn(
                  "border-l-2 px-2 py-1.5 text-left text-xs transition-colors",
                  ticker === a.key
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-transparent hover:bg-muted/50",
                )}
              >
                <div className="font-mono font-semibold">{a.key}</div>
                <div className="truncate text-muted-foreground">{a.full_name}</div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
      <Separator />
      <div className="flex flex-col gap-2 border-t border-border p-3 text-xs">
        <div className="border border-border bg-background/60 p-2">
          <div className="panel-label">12M Target</div>
          <div className="data-metric-lg mt-0.5 text-primary">
            ${analysis?.memo.price_target.toFixed(2) ?? "—"}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            THS {analysis ? computeThesisHealthPct(analysis)?.toFixed(0) : "—"}%
          </div>
          {staleDataLabel(lastUpdated) && (
            <p className="mt-1 text-[10px] text-status-degraded">{staleDataLabel(lastUpdated)}</p>
          )}
        </div>
        <Button
          size="sm"
          onClick={async () => {
            setRecalcState("running");
            try {
              await analyze();
              setRecalcState("done");
              window.setTimeout(() => setRecalcState("idle"), 2000);
            } catch {
              setRecalcState("idle");
            }
          }}
          disabled={isAnalyzing}
          className="h-8 w-full font-mono text-[10px] uppercase"
        >
          <RefreshCw className={cn((isAnalyzing || recalcState === "running") && "animate-spin")} />
          {recalcState === "running" || isAnalyzing
            ? "Running"
            : recalcState === "done"
              ? "Complete"
              : "Recalculate"}
        </Button>
        <Label className="flex h-8 cursor-pointer items-center justify-center gap-2 border border-border px-2 text-[10px] uppercase text-muted-foreground hover:bg-muted/40">
          <FileUp />
          Upload document
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.txt,.json,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
        </Label>
        {lastUpdated && (
          <p className="text-center text-[10px] text-muted-foreground">
            Last run {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </div>
    </aside>
  );
}

export function TerminalTabBar({ ticker }: { ticker: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/terminal/${ticker}/memo`, label: "Memo" },
    { href: `/terminal/${ticker}/tracker`, label: "Tracker" },
    { href: `/terminal/${ticker}/copilot`, label: "Copilot" },
  ];

  return (
    <div className="flex shrink-0 border-b border-border bg-card/40">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "terminal-tab flex-1 sm:flex-none sm:px-6",
            pathname.startsWith(tab.href) && "terminal-tab-active",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
