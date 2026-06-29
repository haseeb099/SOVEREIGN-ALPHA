"use client";

import { usePathname } from "next/navigation";

export function DisclaimerFooter({ className }: { className?: string }) {
  const pathname = usePathname();
  if (pathname.startsWith("/terminal")) return null;

  return (
    <footer
      className={`border-t border-border bg-card/40 px-4 py-1.5 text-center font-mono text-[9px] leading-relaxed text-muted-foreground ${className ?? ""}`}
    >
      <p>
        AI-generated research for informational purposes only. Not financial advice.
        Verify all market data before trading.
      </p>
    </footer>
  );
}
