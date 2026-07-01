"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useTerminalShortcuts({
  onToggleScenario,
  onShowShortcuts,
  onGoToTracker,
  onGoToCharts,
}: {
  onToggleScenario?: () => void;
  onShowShortcuts?: () => void;
  onGoToTracker?: () => void;
  onGoToCharts?: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.altKey && (e.key === "t" || e.key === "T") && onGoToTracker) {
        e.preventDefault();
        onGoToTracker();
      }
      if (e.altKey && (e.key === "c" || e.key === "C") && onGoToCharts) {
        e.preventDefault();
        onGoToCharts();
      }
      if ((e.key === "s" || e.key === "S") && !e.altKey && onToggleScenario) {
        e.preventDefault();
        onToggleScenario();
      }
      if (e.key === "?" && onShowShortcuts) {
        e.preventDefault();
        onShowShortcuts();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggleScenario, onShowShortcuts, onGoToTracker, onGoToCharts]);
}
