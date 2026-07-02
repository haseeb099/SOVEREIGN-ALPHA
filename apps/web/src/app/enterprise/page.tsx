"use client";

import { useState } from "react";
import Link from "next/link";
import { submitEnterpriseLead } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function EnterprisePage() {
  const [form, setForm] = useState({ firm: "", email: "", aum_band: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      await submitEnterpriseLead(form);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-mono text-2xl font-bold">Enterprise</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sovereign-Alpha for research desks, family offices, and asset managers.
        </p>
      </div>
      <section className="space-y-3 text-sm">
        <h2 className="font-mono text-base font-semibold">Service level</h2>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>99.9% monthly API uptime target</li>
          <li>Priority analysis queue for enterprise API keys</li>
          <li>4-hour support response for P1 incidents</li>
          <li>Dedicated onboarding and compliance review</li>
        </ul>
      </section>
      <section className="space-y-3 text-sm">
        <h2 className="font-mono text-base font-semibold">Included capabilities</h2>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>Clerk Organizations with Admin / Analyst / Viewer RBAC</li>
          <li>Append-only audit logs with CSV/JSON export</li>
          <li>Team workspaces with thesis approvals</li>
          <li>White-label branding (logo, colors, disclaimer)</li>
          <li>Unlimited public API with enterprise rate limits</li>
        </ul>
      </section>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 font-mono text-base font-semibold">Contact sales</h2>
          {status === "done" ? (
            <p className="text-sm text-muted-foreground">
              Thanks — our team will reach out within one business day.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="space-y-1">
                <Label>Firm</Label>
                <Input
                  required
                  value={form.firm}
                  onChange={(e) => setForm({ ...form, firm: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>AUM band</Label>
                <Input
                  placeholder="e.g. $500M–$2B"
                  value={form.aum_band}
                  onChange={(e) => setForm({ ...form, aum_band: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Message</Label>
                <Textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Tell us about your team and workflow"
                />
              </div>
              {status === "error" && (
                <p className="text-xs text-destructive">Submission failed. Try again.</p>
              )}
              <Button type="submit" disabled={status === "loading"}>
                {status === "loading" ? "Sending…" : "Request demo"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button render={<Link href="/pricing" />}>Compare plans</Button>
        <Button variant="outline" render={<Link href="/security" />}>
          Trust center
        </Button>
      </div>
    </main>
  );
}
