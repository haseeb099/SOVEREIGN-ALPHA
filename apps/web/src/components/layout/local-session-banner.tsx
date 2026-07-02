"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { CLERK_ENABLED } from "@/lib/api-errors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "sovereign-local-session-dismissed";

const HIDDEN_PREFIXES = ["/pricing", "/terms", "/privacy"];

export function LocalSessionBanner({ className }: { className?: string }) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (CLERK_ENABLED) return null;
  if (dismissed) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p))) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground",
        className,
      )}
      role="status"
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <p className="flex-1">
        Local session only — data stored in this browser. Clearing cache removes all
        holdings, scenarios, and chat history.
      </p>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-6 shrink-0"
        aria-label="Dismiss local session notice"
        onClick={dismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
