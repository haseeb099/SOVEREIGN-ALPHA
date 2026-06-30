"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const DISCLAIMER =
  "AI-generated research for informational purposes only. Not financial advice. Verify all market data before trading.";

export function DisclaimerFooter({ className }: { className?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <footer
      className={cn(
        "border-t border-border bg-card/40 px-4 py-2 text-center text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <p className={cn(!expanded && "line-clamp-2 sm:line-clamp-none")}>{DISCLAIMER}</p>
      <button
        type="button"
        className="mt-1 text-[10px] text-primary underline-offset-2 hover:underline sm:hidden"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </footer>
  );
}
