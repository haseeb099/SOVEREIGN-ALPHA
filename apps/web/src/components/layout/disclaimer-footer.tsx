"use client";

export function DisclaimerFooter({ className }: { className?: string }) {
  return (
    <footer
      className={`border-t border-border/40 bg-card/20 px-4 py-2 text-center text-[10px] leading-relaxed text-muted-foreground ${className ?? ""}`}
    >
      <p>
        Sovereign-Alpha provides AI-generated research for informational purposes only.
        Not financial advice. Past performance does not guarantee future results.
        Market data provided by third-party sources — verify before trading.
      </p>
    </footer>
  );
}
