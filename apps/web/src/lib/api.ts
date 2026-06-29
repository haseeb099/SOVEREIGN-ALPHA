import {
  AnalyzeResponseSchema,
  HealthHistorySchema,
  HealthResponseSchema,
  IngestExtractionSchema,
  MacroEventSchema,
  MarketDataSchema,
  NLScenarioResponseSchema,
  PortfolioSummarySchema,
  ScenarioPreviewResponseSchema,
  type AlertRule,
  type AnalyzeResponse,
  type HealthHistory,
  type HealthResponse,
  type Holding,
  type IngestExtraction,
  type MacroEvent,
  type MarketSearchResult,
  type NLScenarioResponse,
  type PortfolioSummary,
  type PriceBar,
  type Scenario,
  type ScenarioPreviewResponse,
} from "@sovereign/shared";
import { ApiError, classifyFetchError } from "@/lib/api-errors";

const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

/** Browser uses same-origin rewrites (next.config) to avoid CORS; SSR uses direct URL. */
function resolveApiBase(): string {
  if (typeof window !== "undefined") return "";
  return ENV_API_BASE;
}

const API_BASE = resolveApiBase();

const REQUEST_TIMEOUT_MS = 10_000;
const ANALYZE_TIMEOUT_MS = 90_000;
const HEALTH_TIMEOUT_MS = 20_000;

export const FALLBACK_ASSETS: { key: string; full_name: string; asset_class: string }[] = [
  { key: "TSLA", full_name: "Tesla, Inc.", asset_class: "equity" },
  { key: "AAPL", full_name: "Apple Inc.", asset_class: "equity" },
  { key: "NVDA", full_name: "NVIDIA Corporation", asset_class: "equity" },
  { key: "BTC", full_name: "Bitcoin", asset_class: "crypto" },
  { key: "XAU", full_name: "Gold Spot", asset_class: "commodity" },
];

/** Stub for Clerk JWT — wired in auth provider when available. */
let authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  authTokenGetter = getter;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (authTokenGetter) {
    const token = await authTokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function getApiBase(): string {
  return API_BASE || ENV_API_BASE;
}

export function getWsUrl(): string {
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ||
    ENV_API_BASE.replace(/^http/, "ws");
  return `${wsBase}/ws/telemetry`;
}

export function getHealthUrl(): string {
  return API_BASE ? `${API_BASE}/health` : "/health";
}

export const API_URL = API_BASE;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJson<T>(
  res: Response,
  schema?: { parse: (data: unknown) => T },
): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    const kind = res.status === 401 ? "auth" : res.status >= 500 ? "server" : "unknown";
    throw new ApiError(text || `Request failed (${res.status})`, kind, res.status);
  }
  const data = await res.json();
  return schema ? schema.parse(data) : (data as T);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  try {
    const res = await fetchWithTimeout(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...init?.headers,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      const kind = res.status === 401 ? "auth" : res.status >= 500 ? "server" : "unknown";
      throw new ApiError(text || `Request failed (${res.status})`, kind, res.status);
    }
    const data = await res.json();
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    const res = await fetchWithTimeout(
      getHealthUrl(),
      { cache: "no-store" },
      HEALTH_TIMEOUT_MS,
    );
    return await parseJson(res, HealthResponseSchema);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}

export async function fetchMarket(ticker: string) {
  const res = await fetch(`${API_BASE}/api/market/${ticker}`, {
    cache: "no-store",
  });
  return parseJson(res, MarketDataSchema);
}

export async function fetchMarketSearch(
  query: string,
  limit = 8,
): Promise<MarketSearchResult[]> {
  if (!query.trim()) return [];
  try {
    const data = await apiFetch<{ results: MarketSearchResult[] }>(
      `/api/market/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function fetchMarketHistory(
  ticker: string,
  range = "1y",
): Promise<PriceBar[]> {
  try {
    const data = await apiFetch<{ bars: PriceBar[] }>(
      `/api/market/${ticker}/history?range=${range}`,
    );
    return data.bars ?? [];
  } catch {
    return [];
  }
}

export async function fetchAssets() {
  try {
    return await apiFetch<{ assets: { key: string; full_name: string; asset_class: string }[] }>(
      "/api/market/assets/list",
    );
  } catch (err) {
    const apiError = classifyFetchError(err);
    if (apiError.kind === "offline") {
      return { assets: FALLBACK_ASSETS, fallback: true as const };
    }
    throw apiError;
  }
}

export async function fetchMacroEvents(ticker: string): Promise<MacroEvent[]> {
  const data = await apiFetch<{ events: unknown[] }>(
    `/api/market/${ticker}/news?limit=8`,
  );
  return data.events.map((e) => MacroEventSchema.parse(e));
}

export async function runAnalysis(
  ticker: string,
  scenario: Scenario,
  thesisPoints?: AnalyzeResponse["thesis_points"],
): Promise<AnalyzeResponse> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          scenario,
          thesis_points: thesisPoints,
        }),
      },
      ANALYZE_TIMEOUT_MS,
    );
    return await parseJson(res, AnalyzeResponseSchema);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}

export async function previewScenario(
  ticker: string,
  scenario: Scenario,
  baseAnalysis?: AnalyzeResponse,
): Promise<ScenarioPreviewResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/scenario/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, scenario, base_analysis: baseAnalysis }),
    });
    if (!res.ok) return null;
    return parseJson(res, ScenarioPreviewResponseSchema);
  } catch {
    return null;
  }
}

export async function parseNlScenario(text: string): Promise<NLScenarioResponse> {
  const res = await fetch(`${API_BASE}/api/scenario/nl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    cache: "no-store",
  });
  return parseJson(res, NLScenarioResponseSchema);
}

export async function streamCopilot(
  query: string,
  portfolioContext: Record<string, unknown>,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
) {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/copilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ query, portfolio_context: portfolioContext }),
    });

    if (!res.ok || !res.body) {
      onError(`Copilot unavailable (${res.status})`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(payload) as { delta?: string; error?: string };
          if (parsed.error) onError(parsed.error);
          if (parsed.delta) onDelta(parsed.delta);
        } catch {
          /* ignore malformed chunks */
        }
      }
    }
    onDone();
  } catch (err) {
    onError(classifyFetchError(err).message);
  }
}

export async function ingestDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/ingest`, { method: "POST", body: form });
  const data = await parseJson<{
    filename: string;
    file_size_kb: number;
    extraction: IngestExtraction;
  }>(res);
  return {
    ...data,
    extraction: IngestExtractionSchema.parse(data.extraction),
  };
}

export async function fetchHistory(ticker: string) {
  return apiFetch<{
    ticker: string;
    count: number;
    items: { id: string; created_at: string; result: AnalyzeResponse }[];
  }>(`/api/history/${ticker}?limit=10`);
}

export async function fetchHealthHistory(
  ticker: string,
  range = "90d",
): Promise<HealthHistory> {
  return apiFetch<HealthHistory>(
    `/api/history/${ticker}/health?range=${range}`,
  ).then((d) => HealthHistorySchema.parse(d));
}

export async function fetchPortfolioHoldings(): Promise<Holding[]> {
  try {
    const data = await apiFetch<{ holdings: Holding[] }>("/api/portfolio/holdings");
    return data.holdings ?? [];
  } catch {
    return [];
  }
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummary | null> {
  try {
    const data = await apiFetch<PortfolioSummary>("/api/portfolio/summary");
    return PortfolioSummarySchema.parse(data);
  } catch {
    return null;
  }
}

export async function savePortfolioHolding(holding: Holding) {
  return apiFetch("/api/portfolio/holdings", {
    method: "POST",
    body: JSON.stringify(holding),
  });
}

export async function importPortfolioCsv(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/portfolio/import`, {
    method: "POST",
    body: form,
  });
  return parseJson<{ imported: unknown[]; count: number; holdings?: Holding[] }>(res);
}

export async function fetchCompareBatch(tickers: string[]) {
  // Batch runs up to 3 analyses in parallel; allow multiple pipeline rounds.
  const timeoutMs =
    ANALYZE_TIMEOUT_MS * Math.max(1, Math.ceil(tickers.length / 3));
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/analyze/batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      },
      timeoutMs,
    );
    return await parseJson<{ results: AnalyzeResponse[] }>(res);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}

export async function fetchLibraryDocuments() {
  const data = await apiFetch<{
    documents?: {
      id: string;
      filename: string;
      ticker_guess?: string;
      tags?: string[];
      uploaded_at?: string;
      created_at?: string;
    }[];
    items?: {
      id: string;
      filename: string;
      ticker_guess?: string;
      tags?: string[];
      uploaded_at?: string;
    }[];
  }>("/api/library");
  return data.documents ?? data.items ?? [];
}

export async function fetchAlertRules(): Promise<AlertRule[]> {
  try {
    const data = await apiFetch<{ rules: AlertRule[] }>("/api/alerts/rules");
    return data.rules ?? [];
  } catch {
    return [];
  }
}

export async function saveAlertRule(rule: AlertRule) {
  return apiFetch("/api/alerts/rules", {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function deleteAlertRule(ruleId: string) {
  return apiFetch(`/api/alerts/rules/${ruleId}`, { method: "DELETE" });
}

export async function deletePortfolioHolding(holdingId: string) {
  return apiFetch(`/api/portfolio/holdings/${holdingId}`, { method: "DELETE" });
}

export async function deleteLibraryDocument(docId: string) {
  return apiFetch(`/api/library/${docId}`, { method: "DELETE" });
}

export async function fetchReport(id: string) {
  const res = await fetch(`${API_BASE}/api/reports/${id}`, { cache: "no-store" });
  const data = await parseJson<{
    id: string;
    ticker: string;
    created_at?: string;
    payload?: AnalyzeResponse;
    analysis?: AnalyzeResponse;
    share_token?: string;
  }>(res);
  const analysis = data.payload ?? data.analysis;
  if (!analysis) {
    throw new Error("Report payload missing");
  }
  return {
    id: data.id,
    ticker: data.ticker,
    created_at: data.created_at ?? new Date().toISOString(),
    analysis: AnalyzeResponseSchema.parse(analysis),
    share_token: data.share_token ?? id,
  };
}
