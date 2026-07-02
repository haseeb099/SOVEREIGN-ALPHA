"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { completeOnboarding } from "@/lib/api";
import { isOnboardingComplete, markOnboardingComplete } from "@/hooks/use-onboarding";
import { useTerminal } from "@/providers/terminal-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const STEPS = [
  { title: "Pick a ticker", description: "Start with TSLA or enter your own." },
  { title: "Run analysis", description: "We stress-test your thesis with agent defaults." },
  { title: "Review memo", description: "Bull/bear synthesis and thesis tracker." },
  { title: "Save progress", description: "Sign up or upgrade to persist your work." },
];

export function OnboardingWizard() {
  const [open, setOpen] = useState(false);
  const { ticker, setTicker, analyze, isAnalyzing } = useTerminal();
  const [step, setStep] = useState(0);
  const [draftTicker, setDraftTicker] = useState("TSLA");

  useEffect(() => {
    if (!isOnboardingComplete()) setOpen(true);
  }, []);

  const onClose = useCallback(() => setOpen(false), []);

  const finish = useCallback(async () => {
    markOnboardingComplete();
    try {
      await completeOnboarding({ ticker, steps_completed: 4 });
    } catch {
      /* optional analytics */
    }
    onClose();
  }, [onClose, ticker]);

  const next = async () => {
    if (step === 0) {
      setTicker(draftTicker.toUpperCase());
      setStep(1);
      return;
    }
    if (step === 1) {
      await analyze();
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    await finish();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">Get your first memo in 5 minutes</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}: {STEPS[step].description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ol className="flex gap-1">
            {STEPS.map((_, i) => (
              <li
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </ol>

          {step === 0 && (
            <Input
              value={draftTicker}
              onChange={(e) => setDraftTicker(e.target.value.toUpperCase())}
              placeholder="TSLA"
              className="font-mono"
            />
          )}
          {step === 1 && (
            <p className="text-sm text-muted-foreground">
              Running analyze on <span className="font-mono text-foreground">{ticker}</span> with
              sensible scenario defaults…
            </p>
          )}
          {step === 2 && (
            <p className="text-sm text-muted-foreground">
              Open the memo panel to see bull/bear verdict and thesis checkpoints. Use the left sidebar
              for scenario controls.
            </p>
          )}
          {step === 3 && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                Sign up to persist portfolio and library, or start a Pro trial for full access.
              </p>
              <Button variant="outline" size="sm" render={<Link href="/sign-up" />}>
                Create account
              </Button>
              <Button variant="outline" size="sm" render={<Link href="/pricing" />}>
                View Pro pricing
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => void finish()}>
            Skip
          </Button>
          <Button onClick={() => void next()} disabled={step === 1 && isAnalyzing}>
            {step === 3 ? (
              <>
                Done <Check className="ml-1 size-4" />
              </>
            ) : (
              <>
                {step === 1 ? (isAnalyzing ? "Analyzing…" : "Run analyze") : "Continue"}
                <ArrowRight className="ml-1 size-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
