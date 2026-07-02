import { z } from "zod";
import { MemoDistributionSchema } from "./analyze-response";

export const FinancialSnapshotSchema = z.object({
  ticker: z.string(),
  revenue: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  fcf: z.number().nullable().optional(),
  net_debt: z.number().nullable().optional(),
  shares_outstanding: z.number().nullable().optional(),
  beta: z.number().nullable().optional(),
  current_price: z.number().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  enterprise_value: z.number().nullable().optional(),
  source: z.string().optional(),
  insufficient_data: z.boolean().optional(),
  message: z.string().optional(),
});
export type FinancialSnapshot = z.infer<typeof FinancialSnapshotSchema>;

export const DcfAssumptionsSchema = z.object({
  projection_years: z.number().min(1).max(10).default(5),
  wacc: z.number().min(0.01).max(0.3),
  terminal_growth: z.number().min(-0.02).max(0.08),
  fcf_margin: z.number().min(-0.1).max(0.5).optional(),
  revenue_growth: z.number().min(-0.2).max(0.5).optional(),
  capex_pct: z.number().min(0).max(0.3).optional(),
  nwc_pct: z.number().min(0).max(0.3).optional(),
  agent_confidence: z.number().optional(),
  agent_narrative: z.string().optional(),
});
export type DcfAssumptions = z.infer<typeof DcfAssumptionsSchema>;

export const DcfProjectionRowSchema = z.object({
  year: z.number(),
  revenue: z.number(),
  fcf: z.number(),
  discounted_fcf: z.number(),
});

export const DcfResultSchema = z.object({
  implied_share_price: z.number(),
  enterprise_value: z.number(),
  equity_value: z.number(),
  terminal_value: z.number(),
  pv_fcf: z.number(),
  upside_pct: z.number().nullable().optional(),
  current_price: z.number().nullable().optional(),
  projections: z.array(DcfProjectionRowSchema).optional(),
  assumptions: DcfAssumptionsSchema,
});
export type DcfResult = z.infer<typeof DcfResultSchema>;

export const CompsRowSchema = z.object({
  ticker: z.string(),
  name: z.string().optional(),
  ev_revenue: z.number().nullable().optional(),
  ev_ebitda: z.number().nullable().optional(),
  pe_ratio: z.number().nullable().optional(),
  market_cap: z.number().nullable().optional(),
});
export type CompsRow = z.infer<typeof CompsRowSchema>;

export const FootballFieldBandSchema = z.object({
  label: z.string(),
  low: z.number(),
  mid: z.number(),
  high: z.number(),
});

export const CompsResultSchema = z.object({
  peers: z.array(CompsRowSchema),
  implied_price_low: z.number(),
  implied_price_mid: z.number(),
  implied_price_high: z.number(),
  implied_ev_low: z.number().optional(),
  implied_ev_mid: z.number().optional(),
  implied_ev_high: z.number().optional(),
  football_field: z.array(FootballFieldBandSchema).optional(),
  current_price: z.number().nullable().optional(),
});
export type CompsResult = z.infer<typeof CompsResultSchema>;

export const LboAssumptionsSchema = z.object({
  entry_multiple: z.number().min(1).max(30),
  exit_multiple: z.number().min(1).max(30),
  leverage_pct: z.number().min(0).max(0.9),
  hold_years: z.number().min(1).max(10),
  interest_rate: z.number().min(0).max(0.2).optional(),
  revenue_growth: z.number().min(-0.2).max(0.5).optional(),
  ebitda_margin: z.number().min(-0.1).max(0.5).optional(),
});
export type LboAssumptions = z.infer<typeof LboAssumptionsSchema>;

export const LboResultSchema = z.object({
  irr: z.number(),
  moic: z.number(),
  entry_ev: z.number(),
  exit_ev: z.number(),
  equity_invested: z.number(),
  equity_proceeds: z.number(),
  assumptions: LboAssumptionsSchema,
});
export type LboResult = z.infer<typeof LboResultSchema>;

export const MonteCarloConfigSchema = z.object({
  simulations: z.number().min(100).max(10000).default(2000),
  wacc_mean: z.number().optional(),
  wacc_std: z.number().optional(),
  growth_mean: z.number().optional(),
  growth_std: z.number().optional(),
  margin_mean: z.number().optional(),
  margin_std: z.number().optional(),
  base_assumptions: DcfAssumptionsSchema.optional(),
});
export type MonteCarloConfig = z.infer<typeof MonteCarloConfigSchema>;

export const MonteCarloResultSchema = z.object({
  p5: z.number(),
  p50: z.number(),
  p95: z.number(),
  mean: z.number(),
  std: z.number(),
  histogram: z.array(z.object({ bin_start: z.number(), bin_end: z.number(), count: z.number() })),
  simulations: z.number(),
  distribution: MemoDistributionSchema.optional(),
});
export type MonteCarloResult = z.infer<typeof MonteCarloResultSchema>;

export const SensitivityGridSchema = z.object({
  row_axis: z.string(),
  col_axis: z.string(),
  row_values: z.array(z.number()),
  col_values: z.array(z.number()),
  cells: z.array(z.array(z.number())),
  base_row: z.number().optional(),
  base_col: z.number().optional(),
});
export type SensitivityGrid = z.infer<typeof SensitivityGridSchema>;

export const StressScenarioSchema = z.object({
  id: z.string(),
  label: z.string(),
  portfolio_loss_pct: z.number(),
  description: z.string().optional(),
});

export const HoldingRiskContributionSchema = z.object({
  ticker: z.string(),
  weight_pct: z.number(),
  var_contribution: z.number().nullable().optional(),
  stress_loss_pct: z.number().nullable().optional(),
});

export const PortfolioRiskResultSchema = z.object({
  portfolio_var_95: z.number().nullable(),
  portfolio_var_99: z.number().nullable(),
  portfolio_cvar_95: z.number().nullable(),
  max_stress_loss_pct: z.number().nullable(),
  stress_scenarios: z.array(StressScenarioSchema),
  holding_contributions: z.array(HoldingRiskContributionSchema),
  total_value: z.number().optional(),
  observations: z.number().optional(),
});
export type PortfolioRiskResult = z.infer<typeof PortfolioRiskResultSchema>;

export const ValuationLabSnapshotSchema = z.object({
  ticker: z.string(),
  financials: FinancialSnapshotSchema,
  dcf: DcfResultSchema.optional(),
  comps: CompsResultSchema.optional(),
  lbo: LboResultSchema.optional(),
  monte_carlo: MonteCarloResultSchema.optional(),
  sensitivity: SensitivityGridSchema.optional(),
  generated_at: z.string().optional(),
  agent_notes: z.record(z.string()).optional(),
});
export type ValuationLabSnapshot = z.infer<typeof ValuationLabSnapshotSchema>;

export const FinancialNLScenarioResponseSchema = z.object({
  parsed_assumptions: DcfAssumptionsSchema.partial(),
  explanation: z.string(),
  raw: z.string().optional(),
});
export type FinancialNLScenarioResponse = z.infer<typeof FinancialNLScenarioResponseSchema>;
