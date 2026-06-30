import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  infoHint,
  icon: Icon,
  loading,
  loadingLabel = "Loading…",
  variant = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  infoHint?: string;
  icon?: LucideIcon;
  loading?: boolean;
  loadingLabel?: string;
  variant?: "default" | "live" | "warn";
  className?: string;
}) {
  const borderClass =
    variant === "live"
      ? "border-l-status-live"
      : variant === "warn"
        ? "border-l-status-degraded"
        : "border-l-border";

  return (
    <div
      className={cn(
        "terminal-panel border-l-2 p-3",
        borderClass,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="panel-label flex items-center gap-1">
            {label}
            {infoHint && (
              <abbr title={infoHint} className="cursor-help no-underline">
                <Info className="size-3 text-muted-foreground" aria-hidden />
                <span className="sr-only">{infoHint}</span>
              </abbr>
            )}
          </p>
          {loading ? (
            <p className="data-metric-lg mt-1 truncate text-muted-foreground">{loadingLabel}</p>
          ) : (
            <p className="data-metric-lg mt-1 truncate">{value}</p>
          )}
          {hint && !loading && (
            <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
          )}
        </div>
        {Icon && (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
