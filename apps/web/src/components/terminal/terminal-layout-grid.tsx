"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GridLayout, { type Layout } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import { RotateCcw } from "lucide-react";
import { LightweightChartPanel } from "@/components/terminal/lightweight-chart-panel";
import { RiskMetricsPanel } from "@/components/terminal/risk-metrics-panel";
import { OrderBookPanel } from "@/components/terminal/order-book-panel";
import { MacroCalendarPanel } from "@/components/terminal/macro-calendar-panel";
import {
  DEFAULT_INDICATOR_TOGGLES,
  type IndicatorToggles,
} from "@/components/terminal/indicator-overlay-controls";
import {
  PortfolioChartOverlay,
  usePortfolioHolding,
} from "@/components/terminal/portfolio-chart-overlay";
import { ChartsNewsPanel } from "@/components/terminal/charts-news-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LAYOUT_KEY = "sovereign-terminal-layout-v1";

const DEFAULT_LAYOUT: Layout = [
  { i: "chart", x: 0, y: 0, w: 12, h: 11, minH: 6, minW: 6 },
  { i: "risk", x: 0, y: 11, w: 6, h: 3, minH: 2, minW: 3 },
  { i: "depth", x: 6, y: 11, w: 6, h: 3, minH: 2, minW: 3 },
  { i: "news", x: 0, y: 14, w: 6, h: 5, minH: 3, minW: 3 },
  { i: "calendar", x: 6, y: 14, w: 6, h: 5, minH: 3, minW: 3 },
];

function loadLayout(): Layout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Layout;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LAYOUT;
    return parsed;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function TerminalLayoutGrid({ ticker, className }: { ticker: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [toggles, setToggles] = useState<IndicatorToggles>(DEFAULT_INDICATOR_TOGGLES);
  const { costBasis } = usePortfolioHolding(ticker);

  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const onLayoutChange = useCallback((next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore quota */
    }
  }, []);

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT);
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <PortfolioChartOverlay ticker={ticker} className="flex-1 rounded border border-border" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 font-mono text-[9px] uppercase"
          onClick={resetLayout}
        >
          <RotateCcw className="size-3" />
          Reset layout
        </Button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1">
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={28}
          width={width}
          margin={[8, 8]}
          containerPadding={[0, 0]}
          draggableHandle=".panel-drag-handle"
          onLayoutChange={onLayoutChange}
        >
          <div key="chart" className="terminal-panel flex min-h-0 flex-col overflow-hidden">
            <div className="panel-drag-handle cursor-move border-b border-border px-3 py-1">
              <p className="panel-label text-[9px]">Chart</p>
            </div>
            <LightweightChartPanel
              ticker={ticker}
              costBasis={costBasis}
              toggles={toggles}
              onTogglesChange={setToggles}
              className="min-h-0 flex-1 border-0"
            />
          </div>
          <div key="risk" className="terminal-panel flex min-h-0 flex-col overflow-hidden">
            <div className="panel-drag-handle cursor-move border-b border-border px-3 py-1">
              <p className="panel-label text-[9px]">Risk</p>
            </div>
            <RiskMetricsPanel ticker={ticker} className="min-h-0 flex-1 border-0" />
          </div>
          <div key="depth" className="terminal-panel flex min-h-0 flex-col overflow-hidden">
            <div className="panel-drag-handle cursor-move border-b border-border px-3 py-1">
              <p className="panel-label text-[9px]">Depth</p>
            </div>
            <OrderBookPanel ticker={ticker} className="min-h-0 flex-1 border-0" />
          </div>
          <div key="news" className="terminal-panel flex min-h-0 flex-col overflow-hidden">
            <div className="panel-drag-handle cursor-move border-b border-border px-3 py-1">
              <p className="panel-label text-[9px]">News</p>
            </div>
            <ChartsNewsPanel ticker={ticker} className="min-h-0 flex-1 border-0" />
          </div>
          <div key="calendar" className="terminal-panel flex min-h-0 flex-col overflow-hidden">
            <div className="panel-drag-handle cursor-move border-b border-border px-3 py-1">
              <p className="panel-label text-[9px]">Calendar</p>
            </div>
            <MacroCalendarPanel ticker={ticker} className="min-h-0 flex-1 border-0" />
          </div>
        </GridLayout>
      </div>
    </div>
  );
}
