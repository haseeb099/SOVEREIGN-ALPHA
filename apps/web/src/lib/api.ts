import {
  AlertNotificationSchema,
  AnalyzeResponseSchema,
  HealthHistorySchema,
  HealthResponseSchema,
  HistoryDiffSchema,
  IngestExtractionSchema,
  IngestThesisPointSchema,
  MarketDataSchema,
  NLScenarioResponseSchema,
  PortfolioSummarySchema,
  ScenarioPreviewResponseSchema,
  WatchlistSchema,
  WorkflowStatusSchema,
  type AlertNotification,
  type AlertRule,
  type AnalyzeResponse,
  type HealthHistory,
  type HealthResponse,
  type HistoryDiff,
  type CalendarEvent,
  type Holding,
  type IngestExtraction,
  type MacroEvent,
  type MarketDepth,
  type MarketIndicators,
  type MemoFeedbackSection,
  type MarketSearchResult,
  type NLScenarioResponse,
  type PortfolioSummary,
  type PriceBar,
  type RiskMetrics,
  type Scenario,
  type ScenarioPreviewResponse,
  type TickerNewsResponse,
  type Watchlist,
  type WorkflowStatus,
  CalendarEventSchema,
  MacroEventSchema,
  MarketDepthSchema,
  MarketIndicatorsSchema,
  RiskMetricsSchema,
  TickerNewsResponseSchema,
} from "@sovereign/shared";
import { ApiError, apiErrorFromResponse, classifyFetchError } from "@/lib/api-errors";

const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

/** Browser uses same-origin rewrites (next.config) to avoid CORS; SSR uses direct URL. */
function resolveApiBase(): string {
  if (typeof window !== "undefined") return "";
  return ENV_API_BASE;
}

const API_BASE = resolveApiBase();

const REQUEST_TIMEOUT_MS = 10_000;
const ANALYZE_TIMEOUT_MS = 90_000;
const WORKFLOW_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 20_000;

export const FALLBACK_ASSETS: { key: string; full_name: string; asset_class: string }[] = [
  { key: "TSLA", full_name: "Tesla, Inc.", asset_class: "equity" },
  { key: "AAPL", full_name: "Apple Inc.", asset_class: "equity" },
  { key: "NVDA", full_name: "NVIDIA Corporation", asset_class: "equity" },
  { key: "SPY", full_name: "SPDR S&P 500 ETF", asset_class: "etf" },
  { key: "QQQ", full_name: "Invesco QQQ Trust", asset_class: "etf" },
  { key: "IWM", full_name: "iShares Russell 2000 ETF", asset_class: "etf" },
  { key: "TLT", full_name: "iShares 20+ Year Treasury Bond ETF", asset_class: "etf" },
  { key: "GLD", full_name: "SPDR Gold Shares", asset_class: "etf" },
  { key: "BTC", full_name: "Bitcoin", asset_class: "crypto" },
  { key: "ETH", full_name: "Ethereum", asset_class: "crypto" },
  { key: "XAU", full_name: "Gold Spot", asset_class: "commodity" },
  { key: "USO", full_name: "United States Oil Fund", asset_class: "commodity" },
  { key: "EUR", full_name: "EUR/USD", asset_class: "fx" },
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

async function mergeAuthHeaders(
  init?: RequestInit,
): Promise<Record<string, string>> {
  const authHeaders = await getAuthHeaders();
  return {
    "Content-Type": "application/json",
    ...authHeaders,
    ...(init?.headers as Record<string, string> | undefined),
  };
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
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  if (externalSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

async function parseJson<T>(
  res: Response,
  schema?: { parse: (data: unknown) => T },
): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw apiErrorFromResponse(text, res.status);
  }
  const data = await res.json();
  return schema ? schema.parse(data) : (data as T);
}

export function parseIngestExtraction(data: unknown): IngestExtraction {
  const sanitized =
    data && typeof data === "object"
      ? Object.fromEntries(
          Object.entries(data as Record<string, unknown>).filter(([, v]) => v !== null),
        )
      : data;
  const parsed = IngestExtractionSchema.safeParse(sanitized);
  if (parsed.success) return parsed.data;
  const raw = data as Record<string, unknown>;
  return {
    ticker_guess: typeof raw.ticker_guess === "string" ? raw.ticker_guess : undefined,
    rating: typeof raw.rating === "string" ? raw.rating : undefined,
    key_risks: Array.isArray(raw.key_risks)
      ? raw.key_risks.filter((r): r is string => typeof r === "string")
      : undefined,
    thesis_points: Array.isArray(raw.thesis_points)
      ? raw.thesis_points
          .map((tp, i) => {
            const p = IngestThesisPointSchema.safeParse(tp);
            if (p.success) return p.data;
            const item = tp as Record<string, unknown>;
            if (typeof item.text !== "string" || typeof item.metric !== "string") return null;
            return {
              id: Number(item.id ?? i + 1),
              text: item.text,
              metric: item.metric,
              status: "PENDING" as const,
              current_value:
                typeof item.current_value === "string" ? item.current_value : undefined,
              threshold: typeof item.threshold === "string" ? item.threshold : undefined,
            };
          })
          .filter((tp): tp is NonNullable<typeof tp> => tp != null)
      : undefined,
    target_price:
      typeof raw.target_price === "number"
        ? raw.target_price
        : raw.target_price != null
          ? Number(raw.target_price)
          : undefined,
  };
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
      throw apiErrorFromResponse(text, res.status);
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
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/market/${ticker}`, {
    cache: "no-store",
    headers: authHeaders,
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
  interval = "1d",
): Promise<{ bars: PriceBar[]; error?: string }> {
  try {
    const data = await apiFetch<{ bars: PriceBar[]; error?: string }>(
      `/api/market/${ticker}/history?range=${range}&interval=${interval}`,
    );
    return { bars: data.bars ?? [], error: data.error };
  } catch (e) {
    const apiError = classifyFetchError(e);
    return { bars: [], error: apiError.message };
  }
}

export async function fetchMarketIndicators(
  ticker: string,
  range = "1y",
): Promise<MarketIndicators | null> {
  try {
    const data = await apiFetch<{ indicators?: unknown }>(
      `/api/market/${ticker}/indicators?range=${range}`,
    );
    return MarketIndicatorsSchema.parse(data.indicators ?? data);
  } catch {
    return null;
  }
}

export async function fetchRiskMetrics(
  ticker: string,
  range = "1y",
  benchmark = "SPY",
): Promise<RiskMetrics | null> {
  try {
    const data = await apiFetch<unknown>(
      `/api/market/${ticker}/risk-metrics?range=${range}&benchmark=${benchmark}`,
    );
    return RiskMetricsSchema.parse(data);
  } catch {
    return null;
  }
}

export async function fetchMarketDepth(ticker: string): Promise<MarketDepth | null> {
  try {
    const data = await apiFetch<unknown>(`/api/market/${ticker}/depth`);
    return MarketDepthSchema.parse(data);
  } catch {
    return null;
  }
}

export async function fetchMarketCalendar(
  ticker: string,
  days = 30,
): Promise<CalendarEvent[]> {
  try {
    const data = await apiFetch<{ events: unknown[] }>(
      `/api/market/calendar?ticker=${ticker}&days=${days}`,
    );
    return (data.events ?? []).map((e) => CalendarEventSchema.parse(e));
  } catch {
    return [];
  }
}

export async function fetchTickerNews(
  ticker: string,
  limit = 10,
): Promise<TickerNewsResponse> {
  try {
    const data = await apiFetch<unknown>(
      `/api/market/${ticker}/news?limit=${limit}`,
    );
    const parsed = TickerNewsResponseSchema.safeParse(data);
    if (parsed.success) return parsed.data;
    if (data && typeof data === "object" && "events" in data) {
      const raw = data as { events?: unknown[] };
      return {
        events: (raw.events ?? []).map((e) => MacroEventSchema.parse(e)),
        articles: [],
      };
    }
    return { events: [], articles: [] };
  } catch {
    return { events: [], articles: [] };
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
  const data = await fetchTickerNews(ticker, 8);
  return data.events ?? [];
}

export async function runAnalysis(
  ticker: string,
  scenario: Scenario,
  thesisPoints?: AnalyzeResponse["thesis_points"],
  options?: { corpus_id?: string },
): Promise<AnalyzeResponse> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/analyze`,
      {
        method: "POST",
        headers: await mergeAuthHeaders(),
        body: JSON.stringify({
          ticker,
          scenario,
          thesis_points: thesisPoints,
          ...(options?.corpus_id ? { corpus_id: options.corpus_id } : {}),
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
      headers: await mergeAuthHeaders(),
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
    headers: await mergeAuthHeaders(),
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
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    headers: authHeaders,
    body: form,
  });
  const data = await parseJson<{
    filename: string;
    file_size_kb: number;
    extraction: unknown;
  }>(res);
  return {
    ...data,
    extraction: parseIngestExtraction(data.extraction),
  };
}

export async function ingestDocumentBatch(
  files: File[],
  options?: { ticker?: string; name?: string },
) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  if (options?.ticker) form.append("ticker", options.ticker);
  if (options?.name) form.append("name", options.name);
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/ingest/batch`, {
    method: "POST",
    headers: authHeaders,
    body: form,
  });
  return parseJson<{
    corpus_id: string;
    document_ids: string[];
    merged_extraction: IngestExtraction & { source_documents?: unknown[] };
  }>(res);
}

export async function fetchCorpus(corpusId: string) {
  return apiFetch<{
    id: string;
    name: string;
    ticker?: string;
    document_ids: string[];
    merged_extraction?: IngestExtraction;
    documents: { id: string; filename: string; extraction: unknown }[];
    created_at: string;
  }>(`/api/ingest/corpus/${corpusId}`);
}

export async function synthesizeCorpus(corpusId: string) {
  return apiFetch<{ corpus_id: string; merged_extraction: IngestExtraction }>(
    `/api/ingest/corpus/${corpusId}/synthesize`,
    { method: "POST" },
  );
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
  } catch (err) {
    if (err instanceof ApiError && err.kind === "auth") throw err;
    throw classifyFetchError(err);
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

export async function updatePortfolioHolding(
  holdingId: string,
  updates: { shares?: number; cost_basis?: number; account_label?: string },
) {
  return apiFetch(`/api/portfolio/holdings/${holdingId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export async function importPortfolioCsv(file: File) {
  const form = new FormData();
  form.append("file", file);
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/portfolio/import`, {
    method: "POST",
    headers: authHeaders,
    body: form,
  });
  return parseJson<{ imported: unknown[]; count: number; holdings?: Holding[] }>(res);
}

export async function fetchCompareBatch(tickers: string[], signal?: AbortSignal) {
  // Batch runs up to 3 analyses in parallel; allow multiple pipeline rounds.
  const timeoutMs =
    ANALYZE_TIMEOUT_MS * Math.max(1, Math.ceil(tickers.length / 3));
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/analyze/batch`,
      {
        method: "POST",
        headers: await mergeAuthHeaders(),
        body: JSON.stringify({ tickers }),
      },
      timeoutMs,
      signal,
    );
    return await parseJson<{ results: AnalyzeResponse[] }>(res);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}

export async function fetchLibraryDocuments() {
  try {
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
  } catch (err) {
    if (err instanceof ApiError && err.kind === "auth") throw err;
    throw classifyFetchError(err);
  }
}

export async function fetchAlertRules(): Promise<AlertRule[]> {
  try {
    const data = await apiFetch<{ rules: AlertRule[] }>("/api/alerts/rules");
    return data.rules ?? [];
  } catch (err) {
    if (err instanceof ApiError && err.kind === "auth") throw err;
    throw classifyFetchError(err);
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

export async function fetchReport(id: string, unlockToken?: string) {
  const headers: Record<string, string> = {};
  if (unlockToken) headers["X-Report-Unlock"] = unlockToken;
  const res = await fetch(`${API_BASE}/api/reports/${id}`, {
    cache: "no-store",
    headers,
  });
  const data = await parseJson<{
    id: string;
    ticker: string;
    created_at?: string;
    payload?: AnalyzeResponse;
    analysis?: AnalyzeResponse;
    share_token?: string;
    password_protected?: boolean;
    template?: string;
    version?: number;
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
    password_protected: data.password_protected ?? false,
    template: data.template,
    version: data.version,
  };
}

export async function generateReport(
  ticker: string,
  analysis: AnalyzeResponse,
  options?: {
    template?: string;
    expires_in_days?: number;
    password?: string;
    polish?: boolean;
    branding?: { firm_name?: string; logo_url?: string; disclaimer?: string };
    corpus_id?: string;
    parent_report_id?: string;
  },
) {
  return apiFetch<{
    id: string;
    share_token: string;
    share_url: string;
    expires_at: string;
    version?: number;
    template?: string;
    password_protected?: boolean;
  }>("/api/reports/generate", {
    method: "POST",
    body: JSON.stringify({ ticker, analysis, ...options }),
  });
}

export async function unlockReport(token: string, password: string) {
  return apiFetch<{ unlocked: boolean; unlock_token?: string }>(
    `/api/reports/${token}/unlock`,
    { method: "POST", body: JSON.stringify({ password }) },
  );
}

export async function fetchReportHistory(ticker: string) {
  return apiFetch<{
    ticker: string;
    versions: {
      id: string;
      version: number;
      template: string;
      share_token: string;
      created_at: string;
      expires_at?: string;
      password_protected: boolean;
    }[];
  }>(`/api/reports/history?ticker=${encodeURIComponent(ticker)}`);
}

export async function fetchReportDiff(fromId: string, toId: string) {
  return apiFetch<{ from_id: string; to_id: string; diff: Record<string, unknown> }>(
    `/api/reports/diff?from_id=${fromId}&to_id=${toId}`,
  );
}

export async function fetchWatchlists(): Promise<Watchlist[]> {
  const data = await apiFetch<{ watchlists: Watchlist[] }>("/api/watchlists");
  return (data.watchlists ?? []).map((w) => WatchlistSchema.parse(w));
}

export async function createWatchlist(name: string, tickers: string[] = []) {
  const data = await apiFetch<Watchlist>("/api/watchlists", {
    method: "POST",
    body: JSON.stringify({ name, tickers }),
  });
  return WatchlistSchema.parse(data);
}

export async function updateWatchlist(watchlistId: string, tickers: string[]) {
  const data = await apiFetch<Watchlist>(`/api/watchlists/${watchlistId}`, {
    method: "PUT",
    body: JSON.stringify({ tickers }),
  });
  return WatchlistSchema.parse(data);
}

export async function deleteWatchlist(watchlistId: string) {
  return apiFetch<{ deleted: string }>(`/api/watchlists/${watchlistId}`, {
    method: "DELETE",
  });
}

export async function fetchHistoryDiff(ticker: string): Promise<HistoryDiff> {
  const data = await apiFetch<HistoryDiff>(`/api/history/${ticker}/diff`);
  return HistoryDiffSchema.parse(data);
}

export async function fetchAlertNotifications(): Promise<AlertNotification[]> {
  const data = await apiFetch<{ notifications: AlertNotification[] }>(
    "/api/alerts/notifications",
  );
  return (data.notifications ?? []).map((n) => AlertNotificationSchema.parse(n));
}

export async function sendReportEmail(reportId: string, to: string) {
  return apiFetch<{ status: string; detail?: string }>(
    `/api/reports/${reportId}/send`,
    {
      method: "POST",
      body: JSON.stringify({ to }),
    },
  );
}

export async function downloadReportPdf(
  token: string,
): Promise<{ blob: Blob; contentType: string }> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/reports/${token}/pdf`, {
    headers: authHeaders,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw apiErrorFromResponse(text, res.status);
  }
  return {
    blob: await res.blob(),
    contentType: res.headers.get("Content-Type") ?? "application/pdf",
  };
}

export async function fetchFlatfilesStatus() {
  return apiFetch<{
    configured: boolean;
    connected?: boolean;
    status?: string;
    detail?: string;
    known_prefixes?: string[];
  }>("/api/market/flatfiles/status");
}

export type MemoFeedbackPayload = {
  analysis_id?: string;
  ticker?: string;
  section: MemoFeedbackSection;
  vote: "up" | "down";
  comment?: string;
};

export async function submitMemoFeedback(payload: MemoFeedbackPayload) {
  return apiFetch<{ id?: string; section: string; vote: string; created_at?: string }>(
    "/api/feedback",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function startDueDiligenceWorkflow(
  goal: string,
  scenario?: Scenario,
  autoApprove?: boolean,
): Promise<WorkflowStatus> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/workflows/due-diligence`,
      {
        method: "POST",
        headers: await mergeAuthHeaders(),
        body: JSON.stringify({
          goal,
          ...(scenario ? { scenario } : {}),
          ...(autoApprove != null ? { auto_approve: autoApprove } : {}),
        }),
      },
      WORKFLOW_TIMEOUT_MS,
    );
    return await parseJson(res, WorkflowStatusSchema);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}

export async function getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/workflows/${workflowId}`,
      {
        headers: await getAuthHeaders(),
        cache: "no-store",
      },
      WORKFLOW_TIMEOUT_MS,
    );
    return await parseJson(res, WorkflowStatusSchema);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}

export async function approveWorkflowCheckpoint(
  workflowId: string,
  checkpoint: string,
): Promise<WorkflowStatus> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/workflows/${workflowId}/approve`,
      {
        method: "POST",
        headers: await mergeAuthHeaders(),
        body: JSON.stringify({ checkpoint, approved: true }),
      },
      WORKFLOW_TIMEOUT_MS,
    );
    return await parseJson(res, WorkflowStatusSchema);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}

export async function rejectWorkflow(workflowId: string): Promise<WorkflowStatus> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/workflows/${workflowId}/reject`,
      {
        method: "POST",
        headers: await mergeAuthHeaders(),
      },
      WORKFLOW_TIMEOUT_MS,
    );
    return await parseJson(res, WorkflowStatusSchema);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw classifyFetchError(err);
  }
}
