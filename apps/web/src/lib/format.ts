export function formatUsd(value: number | null | undefined, compact = false): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (compact && Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(value) >= 10_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function upsidePct(spot: number, target: number): number {
  if (!spot || spot <= 0) return 0;
  return ((target - spot) / spot) * 100;
}

export function formatTimestamp(
  iso: string | null | undefined,
  opts?: { showDate?: boolean; showTz?: boolean },
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const showDate = opts?.showDate !== false;
  return date.toLocaleString(undefined, {
    ...(showDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    ...(opts?.showTz ? { timeZoneName: "short" } : {}),
  });
}
