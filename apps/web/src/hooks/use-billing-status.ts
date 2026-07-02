"use client";

import { useCallback, useEffect, useState } from "react";

export type BillingStatus = {
  plan_tier: string;
  stripe_configured?: boolean;
  trial_days?: number;
};

export function useBillingStatus() {
  const [status, setStatus] = useState<BillingStatus>({ plan_tier: "free" });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tier = (status.plan_tier || "free").toLowerCase();
  const isPro = tier === "pro" || tier === "enterprise";

  return { ...status, planTier: tier, isPro, loading, refresh };
}
