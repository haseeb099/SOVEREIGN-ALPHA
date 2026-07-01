import { z } from "zod";

export const TickerSchema = z.string().min(1).max(16);
export type Ticker = z.infer<typeof TickerSchema>;

export const RegulatoryLevelSchema = z.enum(["Low", "Medium", "High"]);
export const SentimentSchema = z.enum(["Bullish", "Neutral", "Bearish"]);
export const RatingSchema = z.enum(["BULLISH", "NEUTRAL", "BEARISH"]);
export const ThesisStatusSchema = z.enum(["PASS", "RISK", "FAIL", "PENDING"]);

export const ScenarioSchema = z.object({
  margins: z.number(),
  rates: z.number(),
  regulatory: RegulatoryLevelSchema,
  sentiment: SentimentSchema,
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const DistributionCaseSchema = z.object({
  price: z.number(),
  probability: z.number().optional(),
});

export const MemoDistributionSchema = z.object({
  bear: DistributionCaseSchema,
  base: DistributionCaseSchema,
  bull: DistributionCaseSchema,
});

export const MemoSchema = z.object({
  bull_verdict: z.string(),
  bear_verdict: z.string(),
  summary: z.string(),
  price_target: z.number(),
  confidence_band: z.tuple([z.number(), z.number()]),
  rating: RatingSchema,
  confidence_score: z.number(),
  audit_warnings: z.array(z.string()).optional(),
  distribution: MemoDistributionSchema.optional(),
  insufficient_data: z.boolean().optional(),
});
export type Memo = z.infer<typeof MemoSchema>;

export const ThesisPointSchema = z.object({
  id: z.number(),
  text: z.string(),
  metric: z.string(),
  status: ThesisStatusSchema,
  current_value: z.string().optional(),
  threshold: z.string().optional(),
});
export type ThesisPoint = z.infer<typeof ThesisPointSchema>;

export const RawAgentsSchema = z.record(z.unknown());

export const CitationSourceTypeSchema = z.enum([
  "document",
  "market",
  "filing",
  "news",
]);
export type CitationSourceType = z.infer<typeof CitationSourceTypeSchema>;

export const CitationSchema = z.object({
  chunk_id: z.string().optional(),
  source_type: CitationSourceTypeSchema,
  source_label: z.string(),
  source_date: z.string(),
  data_point: z.string(),
  url: z.string().nullish(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const AgentNameSchema = z.enum([
  "PLANNING",
  "FUNDAMENTAL",
  "MACRO",
  "BULL",
  "RED_TEAM",
  "SYNTHESIS",
  "VERIFICATION",
]);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const AgentTraceSchema = z.object({
  agent: AgentNameSchema,
  confidence: z.number().min(0).max(10),
  insufficient_data: z.boolean(),
  insufficient_reason: z.string().optional(),
  citations: z.array(CitationSchema),
  reasoning_steps: z.array(z.string()).optional(),
  log_message: z.string(),
  elapsed_ms: z.number().optional(),
});
export type AgentTrace = z.infer<typeof AgentTraceSchema>;

export const AgentLogSchema = z.record(z.string(), z.unknown());

export const MemoFeedbackSectionSchema = z.enum([
  "summary",
  "bull",
  "bear",
  "thesis_1",
  "thesis_2",
  "thesis_3",
  "thesis_4",
  "thesis_5",
]);
export type MemoFeedbackSection = z.infer<typeof MemoFeedbackSectionSchema>;

export const MemoFeedbackRequestSchema = z.object({
  analysis_id: z.string().optional(),
  ticker: z.string().optional(),
  section: MemoFeedbackSectionSchema,
  vote: z.enum(["up", "down"]),
  comment: z.string().max(2000).optional(),
});
export type MemoFeedbackRequest = z.infer<typeof MemoFeedbackRequestSchema>;

export const AnalyzeResponseSchema = z
  .object({
    ticker: TickerSchema,
    timestamp: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    asset_price: z.number(),
    asset_change_pct: z.number(),
    volatility_30d: z.number(),
    scenario: ScenarioSchema,
    pipeline_elapsed_seconds: z.number().min(0),
    memo: MemoSchema,
    thesis_points: z.array(ThesisPointSchema),
    agent_traces: z.array(AgentTraceSchema).optional(),
    agent_logs: z.array(AgentLogSchema),
    raw_agents: RawAgentsSchema,
    analysis_id: z.string().optional(),
    sovereign_score: z.number().min(0).max(100).optional(),
    last_updated: z.string().optional(),
    earnings_overlay: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const ScenarioPreviewRequestSchema = z.object({
  ticker: z.string(),
  scenario: ScenarioSchema,
  base_analysis: AnalyzeResponseSchema.optional(),
});
export type ScenarioPreviewRequest = z.infer<typeof ScenarioPreviewRequestSchema>;

export const ScenarioPreviewResponseSchema = z.object({
  ticker: z.string().optional(),
  price_target: z.number(),
  thesis_health_pct: z.number().optional(),
  confidence_score: z.number().optional(),
  rating: RatingSchema.optional(),
  distribution: MemoDistributionSchema.optional(),
  deltas: z.object({
    price_target: z.number(),
    thesis_health_pct: z.number().optional(),
    confidence_score: z.number().optional(),
  }),
  scenario: ScenarioSchema.optional(),
});
export type ScenarioPreviewResponse = z.infer<typeof ScenarioPreviewResponseSchema>;

const SubsystemStatusSchema = z.object({
  status: z.string(),
  detail: z.string().optional(),
  model: z.string().optional(),
  last_fetch_at: z.union([z.string(), z.number()]).optional(),
});

export const HealthResponseSchema = z.object({
  status: z.enum(["online", "degraded", "offline"]),
  model: z.string().optional(),
  provider: z.string().optional(),
  timestamp: z.string().optional(),
  degraded_reason: z.string().nullable().optional(),
  subsystems: z
    .object({
      database: SubsystemStatusSchema.optional(),
      redis: SubsystemStatusSchema.optional(),
      polygon: SubsystemStatusSchema.optional(),
      cerebras: SubsystemStatusSchema.optional(),
      newsapi: SubsystemStatusSchema.optional(),
      last_market_fetch_at: z.union([z.string(), z.number()]).nullable().optional(),
    })
    .passthrough()
    .optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const MarketDataSchema = z.object({
  asset_key: z.string().optional(),
  ticker: z.string().optional(),
  full_name: z.string().optional(),
  asset_class: z.string().optional(),
  icon: z.string().optional(),
  price: z.number(),
  change_pct: z.number(),
  is_positive: z.boolean().optional(),
  volatility_30d: z.number().optional(),
  source: z.string().optional(),
  fetched_at: z.number().optional(),
});
export type MarketData = z.infer<typeof MarketDataSchema>;

export const MarketSearchResultSchema = z.object({
  ticker: z.string(),
  name: z.string().optional(),
  market: z.string().optional(),
  type: z.string().optional(),
});
export type MarketSearchResult = z.infer<typeof MarketSearchResultSchema>;

export const PriceBarSchema = z.object({
  t: z.union([z.number(), z.string()]).optional(),
  time: z.union([z.number(), z.string()]).optional(),
  date: z.string().optional(),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  close: z.number().optional(),
  c: z.number().optional(),
  price: z.number().optional(),
  volume: z.number().optional(),
});
export type PriceBar = z.infer<typeof PriceBarSchema>;

export const IndicatorPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});
export type IndicatorPoint = z.infer<typeof IndicatorPointSchema>;

export const MacdSeriesSchema = z.object({
  line: z.array(IndicatorPointSchema).optional(),
  signal: z.array(IndicatorPointSchema).optional(),
  histogram: z.array(IndicatorPointSchema).optional(),
});

export const BollingerSeriesSchema = z.object({
  upper: z.array(IndicatorPointSchema).optional(),
  middle: z.array(IndicatorPointSchema).optional(),
  lower: z.array(IndicatorPointSchema).optional(),
});

export const MarketIndicatorsSchema = z.object({
  rsi: z.array(IndicatorPointSchema).optional(),
  macd: MacdSeriesSchema.optional(),
  bollinger: BollingerSeriesSchema.optional(),
  volume_sma: z.array(IndicatorPointSchema).optional(),
});
export type MarketIndicators = z.infer<typeof MarketIndicatorsSchema>;

export const RiskMetricsSchema = z.object({
  ticker: z.string().optional(),
  sharpe_ratio: z.number().nullable().optional(),
  max_drawdown: z.number().nullable().optional(),
  var_95: z.number().nullable().optional(),
  beta: z.number().nullable().optional(),
  benchmark: z.string().optional(),
  range: z.string().optional(),
  observations: z.number().optional(),
  risk_free_rate: z.number().optional(),
});
export type RiskMetrics = z.infer<typeof RiskMetricsSchema>;

export const DepthLevelSchema = z.object({
  side: z.enum(["bid", "ask"]),
  price: z.number(),
  size: z.number(),
});
export type DepthLevel = z.infer<typeof DepthLevelSchema>;

export const MarketDepthSchema = z.object({
  ticker: z.string().optional(),
  bid: z.number().nullable().optional(),
  ask: z.number().nullable().optional(),
  spread: z.number().nullable().optional(),
  spread_pct: z.number().nullable().optional(),
  bid_size: z.number().nullable().optional(),
  ask_size: z.number().nullable().optional(),
  levels: z.array(DepthLevelSchema).optional(),
  source: z.string().optional(),
});
export type MarketDepth = z.infer<typeof MarketDepthSchema>;

export const CalendarEventSchema = z.object({
  date: z.string(),
  title: z.string(),
  type: z.enum(["earnings", "fed", "macro"]),
  source: z.string().optional(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const NewsArticleSchema = z.object({
  title: z.string(),
  source: z.string().optional(),
  url: z.string().optional(),
  published_at: z.string().optional(),
  sentiment_score: z.number().optional(),
  sentiment: z.string().optional(),
});
export type NewsArticle = z.infer<typeof NewsArticleSchema>;

/** Backend news feed uses `text`/`sentiment`; legacy mock uses `title`/`impact`. */
export const MacroEventSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    text: z.string().optional(),
    impact: z.string().optional(),
    sentiment: z.string().optional(),
    sentiment_score: z.number().optional(),
    severity: z.enum(["low", "medium", "high"]).optional(),
    timestamp: z.string().optional(),
    published_at: z.string().optional(),
    category: z.string().optional(),
    source: z.string().optional(),
    url: z.string().optional(),
    type: z.string().optional(),
  })
  .transform((e) => ({
    id: e.id != null ? String(e.id) : undefined,
    title: e.title ?? e.text ?? "Event",
    impact: e.impact ?? e.sentiment,
    sentiment: e.sentiment,
    sentiment_score: e.sentiment_score,
    severity: e.severity,
    timestamp: e.timestamp ?? e.published_at,
    category: e.category ?? e.type,
    source: e.source,
    url: e.url,
  }));
export type MacroEvent = z.infer<typeof MacroEventSchema>;

export const TickerNewsResponseSchema = z.object({
  events: z.array(MacroEventSchema).optional(),
  articles: z.array(NewsArticleSchema).optional(),
  ticker_sentiment_score: z.number().optional(),
  bullish_pct: z.number().optional(),
  bearish_pct: z.number().optional(),
  neutral_pct: z.number().optional(),
});
export type TickerNewsResponse = z.infer<typeof TickerNewsResponseSchema>;

export const TelemetryEventSchema = z.object({
  agent: z.string(),
  message: z.string(),
  ts: z.number(),
  severity: z.enum(["info", "warn", "error"]).optional(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const HoldingSchema = z.object({
  id: z.string().optional(),
  ticker: z.string().min(1).regex(/^[A-Z0-9.-]{1,12}$/, "Invalid ticker format"),
  shares: z.number().positive("Shares must be greater than 0"),
  cost_basis: z.number().min(0).optional(),
  account_label: z.string().optional(),
  current_price: z.number().optional(),
  market_value: z.number().optional(),
  unrealized_pnl: z.number().optional(),
  weight_pct: z.number().optional(),
  asset_class: z.string().optional(),
});
export type Holding = z.infer<typeof HoldingSchema>;

export const PortfolioSummarySchema = z.object({
  total_value: z.number(),
  holdings: z.array(HoldingSchema),
  sector_weights: z.record(z.number()),
  concentration_flags: z.array(z.string()),
  hedge_quality_score: z.number().nullable().optional(),
});
export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;

export const HealthHistoryPointSchema = z.object({
  score: z.number(),
  target: z.number().optional(),
  status: z.string().optional(),
  distribution: MemoDistributionSchema.optional(),
  created_at: z.string(),
});
export type HealthHistoryPoint = z.infer<typeof HealthHistoryPointSchema>;

export const HealthHistorySchema = z.object({
  ticker: z.string(),
  range: z.string(),
  points: z.array(HealthHistoryPointSchema),
});
export type HealthHistory = z.infer<typeof HealthHistorySchema>;

export const NLScenarioResponseSchema = z.object({
  parsed_scenario: z.record(z.unknown()),
  explanation: z.string(),
  raw: z.string().optional(),
});
export type NLScenarioResponse = z.infer<typeof NLScenarioResponseSchema>;

/** Relaxed thesis point for document ingest — LLM output may omit status. */
export const IngestThesisPointSchema = z.object({
  id: z.coerce.number(),
  text: z.string(),
  metric: z.string(),
  status: ThesisStatusSchema.optional().default("PENDING"),
  current_value: z.string().optional(),
  threshold: z.string().optional(),
});

/** LLM JSON often uses null instead of omitting optional fields. */
const llmOptionalString = z.preprocess(
  (val) => (val === null || val === undefined ? undefined : val),
  z.string().optional(),
);

const llmOptionalNumber = z.preprocess((val) => {
  if (val === null || val === undefined || val === "") return undefined;
  const n = typeof val === "number" ? val : Number(val);
  return Number.isFinite(n) ? n : undefined;
}, z.number().optional());

export const IngestExtractionSchema = z.object({
  ticker_guess: llmOptionalString,
  document_type: llmOptionalString,
  thesis_points: z.array(IngestThesisPointSchema).optional(),
  key_risks: z.array(z.string()).optional(),
  target_price: llmOptionalNumber,
  rating: llmOptionalString,
  page_refs: z.record(z.unknown()).optional(),
});
export type IngestExtraction = z.infer<typeof IngestExtractionSchema>;

export const WatchlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  tickers: z.array(z.string()),
});
export type Watchlist = z.infer<typeof WatchlistSchema>;

export const HistoryDiffSchema = z.object({
  ticker: z.string(),
  current: z.record(z.unknown()),
  prior: z.record(z.unknown()),
  target_delta: z.number(),
});
export type HistoryDiff = z.infer<typeof HistoryDiffSchema>;

export const AlertNotificationSchema = z.object({
  id: z.string(),
  ticker: z.string(),
  message: z.string(),
  channel: z.string(),
  condition: z.string(),
  created_at: z.string(),
});
export type AlertNotification = z.infer<typeof AlertNotificationSchema>;

export const AlertRuleSchema = z.object({
  id: z.string().optional(),
  ticker: z.string(),
  condition: z.enum([
    "thesis_score_drop",
    "status_change",
    "price_move",
    "earnings_7d",
  ]),
  channel: z.enum(["email", "in_app", "webhook"]),
  threshold: z.number().optional(),
  destination: z.string().optional(),
});
export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const DocumentLibraryItemSchema = z.object({
  id: z.string(),
  filename: z.string(),
  ticker_guess: z.string().optional(),
  tags: z.array(z.string()).optional(),
  uploaded_at: z.string().optional(),
  file_size_kb: z.number().optional(),
});
export type DocumentLibraryItem = z.infer<typeof DocumentLibraryItemSchema>;

export const DEFAULT_SCENARIO: Scenario = {
  margins: 18.5,
  rates: 4.5,
  regulatory: "Low",
  sentiment: "Neutral",
};

export const DEFAULT_TICKER: Ticker = "TSLA";
