"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { MarketIndicators, PriceBar } from "@sovereign/shared";
import { fetchMarketHistory, fetchMarketIndicators } from "@/lib/api";
import {
  DEFAULT_INDICATOR_TOGGLES,
  IndicatorOverlayControls,
  type IndicatorToggles,
} from "@/components/terminal/indicator-overlay-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const HISTORY_RANGES = [
  { key: "1w", label: "1W", api: "1w" },
  { key: "1m", label: "1M", api: "1m" },
  { key: "3m", label: "3M", api: "3m" },
  { key: "6m", label: "6M", api: "6m" },
  { key: "1y", label: "1Y", api: "1y" },
] as const;

type HistoryRange = (typeof HISTORY_RANGES)[number]["key"];

// Lightweight Charts only accepts hex/rgb — not oklch() from the design tokens.
const CHART_BG = "transparent";
const GRID_COLOR = "rgba(255, 255, 255, 0.06)";
const TEXT_COLOR = "#7a7f8c";
const UP_COLOR = "#3dba6e";
const DOWN_COLOR = "#e05c4a";
const ACCENT = "#e8b84a";
const BB_COLOR = "#6b7288";
const RSI_COLOR = "#b07dd4";
const MACD_SIGNAL_COLOR = "#5a8fa8";
const COST_BASIS_COLOR = "#e8943a";

function barTime(bar: PriceBar): string | null {
  if (typeof bar.date === "string") return bar.date.slice(0, 10);
  if (bar.t != null) return String(bar.t).slice(0, 10);
  if (bar.time != null) return String(bar.time).slice(0, 10);
  return null;
}

function barClose(bar: PriceBar): number | null {
  const v = bar.close ?? bar.c ?? bar.price;
  return typeof v === "number" ? v : null;
}

function toCandle(bar: PriceBar) {
  const close = barClose(bar);
  const time = barTime(bar);
  if (close == null || !time) return null;
  const open = bar.open ?? close;
  const high = bar.high ?? Math.max(open, close);
  const low = bar.low ?? Math.min(open, close);
  return { time: time as Time, open, high, low, close };
}

function sliceBars(bars: PriceBar[], range: HistoryRange): PriceBar[] {
  const count =
    range === "1w" ? 7 : range === "1m" ? 22 : range === "3m" ? 66 : range === "6m" ? 126 : 252;
  return bars.slice(-count);
}

type OverlaySeries = {
  bbUpper?: ISeriesApi<"Line">;
  bbMiddle?: ISeriesApi<"Line">;
  bbLower?: ISeriesApi<"Line">;
  rsi?: ISeriesApi<"Line">;
  macd?: ISeriesApi<"Line">;
  macdSignal?: ISeriesApi<"Line">;
  macdHist?: ISeriesApi<"Histogram">;
  volume?: ISeriesApi<"Histogram">;
};

export function LightweightChartPanel({
  ticker,
  costBasis,
  toggles: externalToggles,
  onTogglesChange,
  className,
}: {
  ticker: string;
  costBasis?: number | null;
  toggles?: IndicatorToggles;
  onTogglesChange?: (toggles: IndicatorToggles) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayRef = useRef<OverlaySeries>({});
  const barsRef = useRef<PriceBar[]>([]);
  const priceLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(
    null,
  );

  const [range, setRange] = useState<HistoryRange>("1y");
  const [internalToggles, setInternalToggles] = useState<IndicatorToggles>(
    DEFAULT_INDICATOR_TOGGLES,
  );
  const toggles = externalToggles ?? internalToggles;
  const setToggles = onTogglesChange ?? setInternalToggles;
  const togglesRef = useRef(toggles);
  useEffect(() => {
    togglesRef.current = toggles;
  }, [toggles]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indicators, setIndicators] = useState<MarketIndicators | null>(null);

  const apiRange = HISTORY_RANGES.find((r) => r.key === range)?.api ?? "1y";

  const applyIndicators = useCallback(
    (chart: IChartApi, data: MarketIndicators | null, active: IndicatorToggles) => {
      const overlays = overlayRef.current;
      const remove = (key: keyof OverlaySeries) => {
        const series = overlays[key];
        if (series) {
          chart.removeSeries(series);
          delete overlays[key];
        }
      };

      remove("bbUpper");
      remove("bbMiddle");
      remove("bbLower");
      remove("rsi");
      remove("macd");
      remove("macdSignal");
      remove("macdHist");
      remove("volume");

      if (active.bollinger && data?.bollinger?.upper?.length) {
        const bb = data.bollinger;
        overlays.bbUpper = chart.addSeries(LineSeries, {
          color: BB_COLOR,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        overlays.bbMiddle = chart.addSeries(LineSeries, {
          color: ACCENT,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        overlays.bbLower = chart.addSeries(LineSeries, {
          color: BB_COLOR,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        overlays.bbUpper.setData(
          (bb.upper ?? []).map((p) => ({ time: p.date as Time, value: p.value })),
        );
        overlays.bbMiddle.setData(
          (bb.middle ?? []).map((p) => ({ time: p.date as Time, value: p.value })),
        );
        overlays.bbLower.setData(
          (bb.lower ?? []).map((p) => ({ time: p.date as Time, value: p.value })),
        );
      }

      if (active.rsi && data?.rsi?.length) {
        overlays.rsi = chart.addSeries(LineSeries, {
          color: RSI_COLOR,
          lineWidth: 1,
          priceScaleId: "rsi",
          priceLineVisible: false,
        });
        chart.priceScale("rsi").applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });
        overlays.rsi.setData(data.rsi.map((p) => ({ time: p.date as Time, value: p.value })));
      }

      if (active.macd && data?.macd?.line?.length) {
        const macd = data.macd;
        overlays.macd = chart.addSeries(LineSeries, {
          color: ACCENT,
          lineWidth: 1,
          priceScaleId: "macd",
          priceLineVisible: false,
        });
        overlays.macdSignal = chart.addSeries(LineSeries, {
          color: MACD_SIGNAL_COLOR,
          lineWidth: 1,
          priceScaleId: "macd",
          priceLineVisible: false,
        });
        overlays.macdHist = chart.addSeries(HistogramSeries, {
          priceScaleId: "macd",
          priceLineVisible: false,
        });
        overlays.macd.setData(
          (macd.line ?? []).map((p) => ({ time: p.date as Time, value: p.value })),
        );
        overlays.macdSignal.setData(
          (macd.signal ?? []).map((p) => ({ time: p.date as Time, value: p.value })),
        );
        overlays.macdHist.setData(
          (macd.histogram ?? []).map((p) => ({
            time: p.date as Time,
            value: p.value,
            color: p.value >= 0 ? UP_COLOR : DOWN_COLOR,
          })),
        );
        chart.priceScale("macd").applyOptions({
          scaleMargins: { top: 0.85, bottom: 0 },
        });
      }

      if (active.volume) {
        overlays.volume = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          priceLineVisible: false,
        });
        chart.priceScale("volume").applyOptions({
          scaleMargins: { top: 0.85, bottom: 0 },
        });
      }
    },
    [],
  );

  const applyVolumeData = useCallback((bars: PriceBar[]) => {
    const volumeSeries = overlayRef.current.volume;
    if (!volumeSeries) return;
    const volData = bars
      .map((b) => {
        const time = barTime(b);
        const close = barClose(b);
        const open = b.open ?? close ?? 0;
        const vol = b.volume ?? 0;
        if (!time) return null;
        return {
          time: time as Time,
          value: vol,
          color: (close ?? 0) >= open ? UP_COLOR : DOWN_COLOR,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v != null);
    volumeSeries.setData(volData);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ bars, error: histError }, ind] = await Promise.all([
      fetchMarketHistory(ticker, apiRange),
      fetchMarketIndicators(ticker, apiRange),
    ]);
    setIndicators(ind);

    const sliced = sliceBars(bars, range);
    barsRef.current = sliced;
    const candles = sliced.map(toCandle).filter((c): c is NonNullable<typeof c> => c != null);

    if (candles.length === 0) {
      setError(histError ?? "No OHLCV data available");
      setLoading(false);
      return;
    }

    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) {
      setLoading(false);
      return;
    }

    candle.setData(candles);
    applyIndicators(chart, ind, togglesRef.current);
    if (togglesRef.current.volume) {
      applyVolumeData(sliced);
    }
    chart.timeScale().fitContent();
    setLoading(false);
  }, [ticker, apiRange, range, applyIndicators, applyVolumeData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: TEXT_COLOR,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      autoSize: true,
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });

    chartRef.current = chart;
    candleRef.current = candle;
    overlayRef.current = {};

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          autoSize: false,
          width: containerRef.current.clientWidth,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      overlayRef.current = {};
      priceLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    if (priceLineRef.current) {
      candle.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    if (costBasis != null && costBasis > 0) {
      priceLineRef.current = candle.createPriceLine({
        price: costBasis,
        color: COST_BASIS_COLOR,
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Cost",
      });
    }
  }, [costBasis]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || barsRef.current.length === 0) return;
    applyIndicators(chart, indicators, toggles);
    if (toggles.volume) applyVolumeData(barsRef.current);
  }, [toggles, indicators, applyIndicators, applyVolumeData]);

  const rangeLabel = HISTORY_RANGES.find((r) => r.key === range)?.label ?? "1Y";

  return (
    <div className={cn("terminal-panel flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-3">
          <p className="panel-label">OHLCV · {ticker}</p>
          <IndicatorOverlayControls toggles={toggles} onChange={setToggles} disabled={loading} />
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Chart range">
          {HISTORY_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[9px] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                range === r.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-[320px] flex-1 p-2">
        {loading && <Skeleton className="absolute inset-2 z-10" />}
        {error && !loading ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center">
            <p className="font-mono text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => void loadData()}>
              Retry
            </Button>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="h-full min-h-[280px] w-full"
            role="img"
            aria-label={`${ticker} candlestick chart, ${rangeLabel} range`}
          />
        )}
      </div>
    </div>
  );
}
