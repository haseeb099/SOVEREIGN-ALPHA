import type { AnalyzeResponse } from "@sovereign/shared";

/** confidence_score is 0–10; thesis health is displayed as 0–100%. */
export function confidenceToHealthPct(confidenceScore: number): number {
  return confidenceScore * 10;
}

export function computeThesisHealthPct(analysis: AnalyzeResponse | null | undefined): number | undefined {
  if (!analysis) return undefined;
  const { thesis_points, memo } = analysis;
  if (thesis_points.length > 0) {
    const passCount = thesis_points.filter((p) => p.status === "PASS").length;
    return (passCount / thesis_points.length) * 100;
  }
  return confidenceToHealthPct(memo.confidence_score);
}

export function formatHealthPct(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(0)}%`;
}
