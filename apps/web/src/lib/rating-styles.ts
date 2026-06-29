import type { AnalyzeResponse } from "@sovereign/shared";
import { cn } from "@/lib/utils";

export const RATING_STYLES: Record<
  AnalyzeResponse["memo"]["rating"],
  string
> = {
  BULLISH: "bg-thesis-intact/15 text-thesis-intact border-thesis-intact/30",
  NEUTRAL: "bg-risk-moderate/15 text-risk-moderate border-risk-moderate/30",
  BEARISH: "bg-thesis-broken/15 text-thesis-broken border-thesis-broken/30",
};

export function ratingClass(rating: AnalyzeResponse["memo"]["rating"]): string {
  return cn("font-mono text-[10px]", RATING_STYLES[rating]);
}

export function healthClass(pct: number): string {
  if (pct >= 70) return "text-thesis-intact";
  if (pct >= 40) return "text-status-degraded";
  return "text-thesis-broken";
}
