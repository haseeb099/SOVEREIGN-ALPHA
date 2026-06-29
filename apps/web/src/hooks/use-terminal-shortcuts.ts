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
}: {
  onToggleScenario?: () => void;
  onShowShortcuts?: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if ((e.key === "s" || e.key === "S") && onToggleScenario) {
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
  }, [onToggleScenario, onShowShortcuts]);
}
