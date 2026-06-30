const FACTOR_LABELS: Record<string, string> = {
  ai_robotics: "AI & Robotics",
  fsd: "FSD / Autonomy",
  competition: "Competition",
  margins: "Margins",
  regulatory: "Regulatory",
  sentiment: "Sentiment",
  rates: "Interest Rates",
  demand: "Demand",
  supply_chain: "Supply Chain",
  valuation: "Valuation",
};

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatFactorLabel(key: string): string {
  if (FACTOR_LABELS[key]) return FACTOR_LABELS[key];
  return titleCase(key.replace(/_/g, " "));
}
