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
import { classifyFetchError, toastApiError } from "@/lib/api-errors";
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
  hydrated: boolean;
  canUndo: boolean;
  canRedo: boolean;
  analyze: (force?: boolean) => Promise<void>;
  applyScenarioField: <K extends keyof Scenario>(key: K, value: Scenario[K]) => void;
  undoScenario: () => void;
  redoScenario: () => void;
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

function persistScenario(ticker: string, scenario: Scenario) {
  try {
    localStorage.setItem(scenarioStorageKey(ticker), JSON.stringify(scenario));
  } catch {
    /* ignore quota */
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
  const [scenario, setScenarioState] = useState<Scenario>(DEFAULT_SCENARIO);
  const [scenarioHistory, setScenarioHistory] = useState<Scenario[]>([DEFAULT_SCENARIO]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [preview, setPreview] = useState<ScenarioPreviewResponse | null>(null);
  const [previewOffline, setPreviewOffline] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [isCached, setIsCached] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisRef = useRef<AnalyzeResponse | null>(null);
  const scenarioRef = useRef<Scenario>(DEFAULT_SCENARIO);
  const historyIndexRef = useRef(0);
  const skipHistoryRef = useRef(false);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

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

  const applyScenario = useCallback(
    (next: Scenario, recordHistory = true) => {
      setScenarioState(next);
      scenarioRef.current = next;
      persistScenario(ticker, next);

      if (recordHistory && !skipHistoryRef.current) {
        setScenarioHistory((prev) => {
          const base = prev.slice(0, historyIndexRef.current + 1);
          const updated = [...base, next];
          historyIndexRef.current = updated.length - 1;
          return updated;
        });
        setHistoryIndex(historyIndexRef.current);
      }

      debouncedPreview(next, analysisRef.current);
    },
    [debouncedPreview, ticker],
  );

  const analyze = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);
    setIsCached(false);
    const activeScenario = scenarioRef.current;
    try {
      const result = await runAnalysis(
        ticker as Ticker,
        activeScenario,
        analysisRef.current?.thesis_points,
      );
      setAnalysis(result);
      skipHistoryRef.current = true;
      applyScenario(result.scenario, false);
      skipHistoryRef.current = false;
      setScenarioHistory([result.scenario]);
      setHistoryIndex(0);
      historyIndexRef.current = 0;
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
      toastApiError(apiError, { onRetry: () => void analyze() });
      try {
        const cached = sessionStorage.getItem(`sovereign-analysis-${ticker}`);
        if (cached) {
          setAnalysis(JSON.parse(cached) as AnalyzeResponse);
          setIsCached(true);
        }
      } catch {
        /* ignore */
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [ticker, applyScenario]);

  const setScenario = useCallback(
    (next: Scenario) => {
      applyScenario(next, true);
    },
    [applyScenario],
  );

  const applyScenarioField = useCallback(
    <K extends keyof Scenario>(key: K, value: Scenario[K]) => {
      const next = { ...scenarioRef.current, [key]: value };
      applyScenario(next, true);
    },
    [applyScenario],
  );

  const undoScenario = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const newIndex = historyIndexRef.current - 1;
    const prev = scenarioHistory[newIndex];
    if (!prev) return;
    skipHistoryRef.current = true;
    applyScenario(prev, false);
    skipHistoryRef.current = false;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
  }, [applyScenario, scenarioHistory]);

  const redoScenario = useCallback(() => {
    if (historyIndexRef.current >= scenarioHistory.length - 1) return;
    const newIndex = historyIndexRef.current + 1;
    const next = scenarioHistory[newIndex];
    if (!next) return;
    skipHistoryRef.current = true;
    applyScenario(next, false);
    skipHistoryRef.current = false;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
  }, [applyScenario, scenarioHistory]);

  useEffect(() => {
    setError(null);
    let nextScenario = loadStoredScenario(ticker) ?? DEFAULT_SCENARIO;

    try {
      const cached = sessionStorage.getItem(`sovereign-analysis-${ticker}`);
      if (cached) {
        const parsed = JSON.parse(cached) as AnalyzeResponse;
        setAnalysis(parsed);
        setIsCached(true);
        setLastUpdated(parsed.timestamp);
        if (parsed.scenario) nextScenario = parsed.scenario;
      } else {
        setAnalysis(null);
        setIsCached(false);
        setLastUpdated(null);
      }
    } catch {
      setAnalysis(null);
      setIsCached(false);
      setLastUpdated(null);
    }

    skipHistoryRef.current = true;
    setScenarioState(nextScenario);
    scenarioRef.current = nextScenario;
    setScenarioHistory([nextScenario]);
    setHistoryIndex(0);
    historyIndexRef.current = 0;
    skipHistoryRef.current = false;
    setHydrated(true);
    setPreview(null);

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
      hydrated,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < scenarioHistory.length - 1,
      analyze,
      applyScenarioField,
      undoScenario,
      redoScenario,
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
      hydrated,
      historyIndex,
      scenarioHistory.length,
      analyze,
      setScenario,
      applyScenarioField,
      undoScenario,
      redoScenario,
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
