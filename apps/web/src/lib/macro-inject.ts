import type { MacroEvent, Scenario } from "@sovereign/shared";

export function applyMacroEventToScenario(
  event: MacroEvent,
  scenario: Scenario,
): Partial<Scenario> {
  const impact = (event.impact ?? "").toLowerCase();
  const category = (event.category ?? "").toLowerCase();
  const patch: Partial<Scenario> = {};

  if (category.includes("rate") || event.title.toLowerCase().includes("fed")) {
    patch.rates = Math.min(10, scenario.rates + 0.5);
  } else if (impact.includes("bear")) {
    patch.sentiment = "Bearish";
  } else if (impact.includes("bull")) {
    patch.sentiment = "Bullish";
  } else {
    patch.regulatory = "High";
  }
  return patch;
}
