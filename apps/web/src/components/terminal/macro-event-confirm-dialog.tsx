"use client";

import type { MacroEvent, Scenario } from "@sovereign/shared";
import { applyMacroEventToScenario } from "@/lib/macro-inject";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function formatScenarioValue(key: keyof Scenario, value: Scenario[keyof Scenario]): string {
  if (typeof value === "number") return `${value.toFixed(key === "rates" ? 2 : 1)}%`;
  return String(value);
}

function describeDeltas(
  event: MacroEvent,
  scenario: Scenario,
): { field: string; from: string; to: string }[] {
  const patch = applyMacroEventToScenario(event, scenario);
  return Object.entries(patch).map(([key, value]) => ({
    field: key.charAt(0).toUpperCase() + key.slice(1),
    from: formatScenarioValue(key as keyof Scenario, scenario[key as keyof Scenario]),
    to: formatScenarioValue(key as keyof Scenario, value as Scenario[keyof Scenario]),
  }));
}

export function MacroEventConfirmDialog({
  event,
  scenario,
  open,
  onOpenChange,
  onConfirm,
}: {
  event: MacroEvent | null;
  scenario: Scenario;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!event) return null;

  const deltas = describeDeltas(event, scenario);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Apply macro scenario?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-xs">
          <div>
            <Badge variant="outline" className="mb-2 font-mono text-[9px]">
              {event.category?.toUpperCase() ?? "EVENT"}
            </Badge>
            <p className="font-medium leading-snug">{event.title}</p>
            {event.impact && (
              <p className="mt-1 text-muted-foreground">Impact: {event.impact}</p>
            )}
          </div>
          {deltas.length > 0 && (
            <div className="border border-border bg-muted/20 p-2">
              <p className="panel-label mb-2">Scenario changes</p>
              <ul className="flex flex-col gap-1.5 font-mono text-[11px]">
                {deltas.map((d) => (
                  <li key={d.field}>
                    {d.field}: {d.from} → {d.to}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Apply to scenario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
