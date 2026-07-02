"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FEATURE_LABELS: Record<string, string> = {
  portfolio: "Portfolio persistence",
  library: "Document library",
  alerts: "Alert rules",
  copilot: "Portfolio copilot",
  reports: "PDF reports",
};

export type PlanTier = "free" | "pro" | "enterprise";

export function isProTier(tier: PlanTier | string | null | undefined): boolean {
  const t = (tier ?? "free").toLowerCase();
  return t === "pro" || t === "enterprise";
}

export function PlanGate({
  feature,
  children,
}: {
  feature: string;
  children: ReactNode;
}) {
  const { isPro, planTier, loading } = useBillingStatus();
  const label = FEATURE_LABELS[feature] ?? feature;

  if (loading || isPro) return <>{children}</>;

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:text-left">
          <Sparkles className="size-8 shrink-0 text-primary" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">Pro plan required</p>
            <p className="text-xs text-muted-foreground">
              {label} is included on Pro ($99/mo) and Enterprise. Current plan: {planTier}.
            </p>
          </div>
          <Button size="sm" render={<Link href="/pricing" />}>
            Upgrade to Pro
          </Button>
        </CardContent>
      </Card>
      {children}
    </div>
  );
}
