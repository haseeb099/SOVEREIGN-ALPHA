"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function PricingPage() {
  return (
    <DashboardShell title="Pricing" subtitle="Personal, Pro, and Enterprise plans">
      <div className="flex max-w-4xl flex-col gap-8">
        <PricingTiers />
        <div className="flex gap-4 text-xs text-muted-foreground">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/security">Security</Link>
        </div>
      </div>
    </DashboardShell>
  );
}

function PricingTiers() {
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Personal for exploration, Pro for full persistence, Enterprise for desks and compliance.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-6">
          <h2 className="font-mono text-lg font-semibold">Personal</h2>
          <p className="mt-2 text-3xl font-bold">$0</p>
          <p className="text-sm text-muted-foreground">
            Terminal, compare, scenario lab, community feed
          </p>
          <Button className="mt-4" variant="outline" render={<Link href="/terminal" />}>
            Open terminal
          </Button>
        </div>
        <div className="rounded-lg border border-primary/40 p-6">
          <h2 className="font-mono text-lg font-semibold">Pro</h2>
          <p className="mt-2 text-3xl font-bold">$99/mo</p>
          <p className="text-sm text-muted-foreground">
            Portfolio persistence, alerts, document library, copilot, PDF reports
          </p>
          <ProCheckoutButton hasClerk={hasClerk} />
        </div>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-6">
          <h2 className="font-mono text-lg font-semibold">Enterprise</h2>
          <p className="mt-2 text-3xl font-bold">Custom</p>
          <p className="text-sm text-muted-foreground">
            99.9% SLA, dedicated support, white-label branding, unlimited API, RBAC & audit logs
          </p>
          <Button className="mt-4" render={<Link href="/enterprise" />}>
            Contact sales
          </Button>
        </div>
      </div>
    </>
  );
}

function ProCheckoutButton({ hasClerk }: { hasClerk: boolean }) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    if (!hasClerk) {
      window.location.href = "/sign-up";
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      const url = data.checkout_url ?? data.url;
      if (url) window.location.href = url;
      else if (res.status === 401) window.location.href = "/sign-in";
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button className="mt-4" onClick={startCheckout} disabled={loading}>
      {loading ? "Redirecting…" : "Start Pro trial"}
    </Button>
  );
}
