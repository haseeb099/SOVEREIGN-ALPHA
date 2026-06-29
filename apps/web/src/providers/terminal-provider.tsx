"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SCENARIO,
  DEFAULT_TICKER,
  computeScenarioPreview,
  type AnalyzeResponse,
  type Scenario,
  type ScenarioPreviewResponse,
  type Ticker,
} from "@sovereign/shared";
import { previewScenario, runAnalysis } from "@/lib/api";
import { classifyFetchError, friendlyOfflineToast } from "@/lib/api-errors";
import { toast } from "sonner";

type TerminalContextValue = {
  ticker: string;
  setTicker: (t: string) => void;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  analysis: AnalyzeResponse | null;
  preview: ScenarioPreviewResponse | null;
  previewOffline: boolean;
  isAnalyzing: boolean;
  lastUpdated: string | null;
  error: unknown | null;
  isCached: boolean;
  analyze: (force?: boolean) => Promise<void>;
  applyScenarioField: <K extends keyof Scenario>(key: K, value: Scenario[K]) => void;
};

const TerminalContext = createContext<TerminalContextValue | null>(null);

function scenarioStorageKey(ticker: string) {
  return `sovereign-scenario-${ticker}`;
}

function loadStoredScenario(ticker: string): Scenario | null {
  try {
    const raw = localStorage.getItem(scenarioStorageKey(ticker));
    if (!raw) return null;
    return JSON.parse(raw) as Scenario;
  } catch {
    return null;
  }
}

export function TerminalProvider({
  initialTicker = DEFAULT_TICKER,
  children,
}: {
  initialTicker?: string;
  children: ReactNode;
}) {
  const [ticker, setTicker] = useState(initialTicker.toUpperCase());
  const [scenario, setScenarioState] = useState<Scenario>(() => {
    if (typeof window === "undefined") return DEFAULT_SCENARIO;
    return loadStoredScenario(initialTicker.toUpperCase()) ?? DEFAULT_SCENARIO;
  });
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [preview, setPreview] = useState<ScenarioPreviewResponse | null>(null);
  const [previewOffline, setPreviewOffline] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [isCached, setIsCached] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisRef = useRef<AnalyzeResponse | null>(null);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  const analyze = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);
    setIsCached(false);
    try {
      const result = await runAnalysis(
        ticker as Ticker,
        scenario,
        analysisRef.current?.thesis_points,
      );
      setAnalysis(result);
      setScenarioState(result.scenario);
      setLastUpdated(result.timestamp);
      setPreview(null);
      try {
        sessionStorage.setItem(`sovereign-analysis-${ticker}`, JSON.stringify(result));
      } catch {
        /* ignore quota errors */
      }
      toast.success(`Analysis complete for ${ticker}`);
    } catch (e) {
      const apiError = classifyFetchError(e);
      setError(apiError);
      toast.error(apiError.kind === "offline" ? friendlyOfflineToast() : apiError.message);
      try {
        const cached = sessionStorage.getItem(`sovereign-analysis-${ticker}`);
        if (cached) {
          setAnalysis(JSON.parse(cached) as AnalyzeResponse);
          setIsCached(true);
          toast.info("Showing cached analysis");
        }
      } catch {
        /* ignore */
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [ticker, scenario]);

  const debouncedPreview = useCallback(
    (nextScenario: Scenario, base: AnalyzeResponse | null) => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(async () => {
        const currentPrice = base?.asset_price ?? 0;
        if (currentPrice > 0 || base?.memo?.price_target) {
          const local = computeScenarioPreview(
            ticker,
            currentPrice || base!.memo.price_target / 1.12,
            nextScenario,
            base,
          );
          setPreview(local);
        }
        const result = await previewScenario(ticker, nextScenario, base ?? undefined);
        if (result) {
          setPreview(result);
          setPreviewOffline(false);
        } else {
          setPreviewOffline(true);
        }
      }, 200);
    },
    [ticker],
  );

  const setScenario = useCallback(
    (next: Scenario) => {
      setScenarioState(next);
      try {
        localStorage.setItem(scenarioStorageKey(ticker), JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      debouncedPreview(next, analysisRef.current);
    },
    [debouncedPreview, ticker],
  );

  const applyScenarioField = useCallback(
    <K extends keyof Scenario>(key: K, value: Scenario[K]) => {
      setScenarioState((prev) => {
        const next = { ...prev, [key]: value };
        try {
          localStorage.setItem(scenarioStorageKey(ticker), JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
        debouncedPreview(next, analysisRef.current);
        return next;
      });
    },
    [debouncedPreview, ticker],
  );

  useEffect(() => {
    setError(null);
    const storedScenario = loadStoredScenario(ticker);
    if (storedScenario) {
      setScenarioState(storedScenario);
    }
    try {
      const cached = sessionStorage.getItem(`sovereign-analysis-${ticker}`);
      if (cached) {
        const parsed = JSON.parse(cached) as AnalyzeResponse;
        setAnalysis(parsed);
        setIsCached(true);
        setLastUpdated(parsed.timestamp);
        setScenarioState(parsed.scenario);
      } else {
        setAnalysis(null);
        setIsCached(false);
      }
    } catch {
      setAnalysis(null);
      setIsCached(false);
    }
    void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on ticker change only
  }, [ticker]);

  const value = useMemo(
    () => ({
      ticker,
      setTicker,
      scenario,
      setScenario,
      analysis,
      preview,
      previewOffline,
      isAnalyzing,
      lastUpdated,
      error,
      isCached,
      analyze,
      applyScenarioField,
    }),
    [
      ticker,
      scenario,
      analysis,
      preview,
      previewOffline,
      isAnalyzing,
      lastUpdated,
      error,
      isCached,
      analyze,
      setScenario,
      applyScenarioField,
    ],
  );

  return (
    <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>
  );
}

export function useTerminal() {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider");
  return ctx;
}
