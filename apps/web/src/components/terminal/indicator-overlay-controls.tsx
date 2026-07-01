"use client";

import { cn } from "@/lib/utils";

export type IndicatorToggles = {
  rsi: boolean;
  macd: boolean;
  bollinger: boolean;
  volume: boolean;
};

export const DEFAULT_INDICATOR_TOGGLES: IndicatorToggles = {
  rsi: false,
  macd: false,
  bollinger: false,
  volume: true,
};

const TOGGLE_ITEMS: { key: keyof IndicatorToggles; label: string; hint: string }[] = [
  { key: "rsi", label: "RSI", hint: "Relative Strength Index (14)" },
  { key: "macd", label: "MACD", hint: "MACD (12, 26, 9)" },
  { key: "bollinger", label: "BB", hint: "Bollinger Bands (20, 2)" },
  { key: "volume", label: "Volume", hint: "Volume histogram" },
];

export function IndicatorOverlayControls({
  toggles,
  onChange,
  disabled,
}: {
  toggles: IndicatorToggles;
  onChange: (next: IndicatorToggles) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label="Technical indicator overlays"
    >
      {TOGGLE_ITEMS.map((item) => {
        const active = toggles[item.key];
        return (
          <button
            key={item.key}
            type="button"
            title={item.hint}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[9px] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50",
            )}
            onClick={() => onChange({ ...toggles, [item.key]: !active })}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
