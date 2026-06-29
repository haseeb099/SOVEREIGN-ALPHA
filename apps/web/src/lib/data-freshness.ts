const STALE_THRESHOLD_MS = 15 * 60 * 1000;

export function isDataStale(timestamp: string | null | undefined): boolean {
  if (!timestamp) return true;
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > STALE_THRESHOLD_MS;
}

export function formatDataAge(timestamp: string | null | undefined): string {
  if (!timestamp) return "Unknown age";
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return "Unknown age";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function staleDataLabel(timestamp: string | null | undefined): string | null {
  if (!isDataStale(timestamp)) return null;
  return `Data may be stale (${formatDataAge(timestamp)})`;
}
