"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { applyBeta, verifyBetaInvite } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function BetaPageClient() {
  const params = useSearchParams();
  const prefillCode = params.get("code") ?? "";

  const [tab, setTab] = useState<"apply" | "verify">(prefillCode ? "verify" : "apply");
  const [status, setStatus] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    name: "",
    firm: "",
    role: "analyst",
    use_case: "",
  });
  const [inviteCode, setInviteCode] = useState(prefillCode);

  const onApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await applyBeta(form);
      setStatus(res.status === "already_applied" ? "already" : "applied");
    } catch {
      setStatus("error");
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      await verifyBetaInvite(inviteCode);
      setStatus("verified");
    } catch {
      setStatus("verify-error");
    }
  };

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <div>
        <h1 className="font-mono text-2xl font-bold">Beta programme</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;re onboarding 20 analysts for hands-on feedback. Apply or redeem your invite code.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={tab === "apply" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("apply")}
        >
          Apply
        </Button>
        <Button
          variant={tab === "verify" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("verify")}
        >
          Redeem invite
        </Button>
      </div>

      {tab === "apply" ? (
        <Card>
          <CardContent className="pt-6">
            {status === "applied" || status === "already" ? (
              <p className="text-sm">
                {status === "already"
                  ? "We already have your application."
                  : "Application received — we'll email you if approved."}
              </p>
            ) : (
              <form onSubmit={onApply} className="flex flex-col gap-3">
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
                  <Label>Name</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Firm</Label>
                  <Input
                    required
                    value={form.firm}
                    onChange={(e) => setForm({ ...form, firm: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Use case</Label>
                  <Textarea
                    required
                    minLength={10}
                    value={form.use_case}
                    onChange={(e) => setForm({ ...form, use_case: e.target.value })}
                    placeholder="How would you use Sovereign-Alpha in your workflow?"
                  />
                </div>
                <Button type="submit" disabled={status === "loading"}>
                  Submit application
                </Button>
                {status === "error" && (
                  <p className="text-xs text-destructive">Submission failed. Try again.</p>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {status === "verified" ? (
              <p className="text-sm">
                Pro access activated for 90 days.{" "}
                <Link href="/terminal" className="text-primary underline">
                  Open terminal
                </Link>
              </p>
            ) : (
              <form onSubmit={onVerify} className="flex flex-col gap-3">
                <div className="space-y-1">
                  <Label>Invite code</Label>
                  <Input
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="SA-XXXXXXXX"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Sign in first to activate your code.</p>
                <Button type="submit" disabled={status === "loading"}>
                  Activate Pro
                </Button>
                {status === "verify-error" && (
                  <p className="text-xs text-destructive">Invalid code or not signed in.</p>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Button variant="link" className="self-start p-0" render={<Link href="/pricing" />}>
        View pricing →
      </Button>
    </main>
  );
}
