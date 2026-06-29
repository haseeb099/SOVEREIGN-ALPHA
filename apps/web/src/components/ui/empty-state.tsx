"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "terminal-panel flex flex-col items-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && <Icon className="size-6 text-muted-foreground" strokeWidth={1.5} />}
      <div className="space-y-1">
        <p className="font-mono text-sm font-medium">{title}</p>
        {description && (
          <p className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actionLabel && onAction && (
        <Button size="sm" className="h-8 font-mono text-[10px] uppercase" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
