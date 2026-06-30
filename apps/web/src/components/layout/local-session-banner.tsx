"use client";

import { Info } from "lucide-react";
import { CLERK_ENABLED } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

export function LocalSessionBanner({ className }: { className?: string }) {
  if (CLERK_ENABLED) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground",
        className,
      )}
      role="status"
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <p>
        Local session only — data stored in this browser. Clearing cache removes all
        holdings, scenarios, and chat history.
      </p>
    </div>
  );
}
