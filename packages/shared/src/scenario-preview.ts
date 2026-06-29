import type { AnalyzeResponse, Scenario, ScenarioPreviewResponse } from "./schemas/analyze-response";

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

const DEFAULT_PROBABILITIES = { bear: 0.2, base: 0.55, bull: 0.25 };

function buildDistribution(currentPrice: number, priceTarget: number) {
  let bull = priceTarget * 1.25;
  let bear = priceTarget * 0.75;
  if (bear > priceTarget) bear = priceTarget * 0.85;
  if (bull < priceTarget) bull = priceTarget * 1.15;
  bear = clamp(bear, currentPrice * 0.5, priceTarget);
  bull = clamp(bull, priceTarget, currentPrice * 3);
  return {
    bear: { price: Math.round(bear * 100) / 100, probability: DEFAULT_PROBABILITIES.bear },
    base: { price: Math.round(priceTarget * 100) / 100, probability: DEFAULT_PROBABILITIES.base },
    bull: { price: Math.round(bull * 100) / 100, probability: DEFAULT_PROBABILITIES.bull },
  };
}

/** Client-side deterministic scenario preview — mirrors backend valuation_engine.scenario_preview */
export function computeScenarioPreview(
  ticker: string,
  currentPrice: number,
  scenario: Scenario,
  baseAnalysis?: AnalyzeResponse | null,
): ScenarioPreviewResponse {
  const base = baseAnalysis ?? undefined;
  const baseMargins = scenario.margins;
  const baseRates = scenario.rates;
  const margins = scenario.margins;
  const rates = scenario.rates;
  const regulatory = scenario.regulatory;
  const sentiment = scenario.sentiment;

  const marginDelta = (margins - baseMargins) / 100;
  const rateDelta = (rates - baseRates) / 100;
  const regMult: Record<string, number> = { Low: 0, Medium: -0.03, High: -0.08 };
  const sentMult: Record<string, number> = { Bullish: 0.05, Neutral: 0, Bearish: -0.06 };

  const baseTarget = base?.memo?.price_target ?? currentPrice * 1.12;
  const baseHealth = (base?.memo?.confidence_score ?? 7.0) * 10;

  const targetMult =
    1 +
    marginDelta * 2.5 -
    rateDelta * 1.8 +
    (regMult[regulatory] ?? 0) +
    (sentMult[sentiment] ?? 0);
  const newTarget = Math.round(baseTarget * targetMult * 100) / 100;
  const healthDelta =
    marginDelta * 30 - rateDelta * 20 + (sentMult[sentiment] ?? 0) * 100 + (regMult[regulatory] ?? 0) * 100;
  const newHealth = clamp(baseHealth + healthDelta, 0, 100);

  const distribution = buildDistribution(currentPrice || baseTarget, newTarget);

  return {
    ticker: ticker.toUpperCase(),
    price_target: newTarget,
    thesis_health_pct: Math.round(newHealth * 10) / 10,
    distribution,
    deltas: {
      price_target: Math.round((newTarget - baseTarget) * 100) / 100,
      thesis_health_pct: Math.round((newHealth - baseHealth) * 10) / 10,
    },
    scenario,
  };
}
