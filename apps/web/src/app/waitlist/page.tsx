"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { joinWaitlist } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("analyst");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await joinWaitlist({ email, role });
      setMessage(res.status === "already_subscribed" ? "You're already on the list." : "You're in!");
      setStatus("done");
    } catch {
      setMessage("Something went wrong. Try again or email us.");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="size-12 text-primary" />
        <h1 className="font-mono text-xl font-bold">You&apos;re on the waitlist</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button render={<Link href="/terminal/TSLA/memo?demo=1" />}>Try the live demo</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="font-mono text-2xl font-bold">Join the waitlist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Get early access to Pro features and the beta analyst programme.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@fund.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analyst">Analyst</SelectItem>
                  <SelectItem value="pm">Portfolio manager</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === "error" && (
              <p className="text-xs text-destructive">{message}</p>
            )}
            <Button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Joining…" : "Join waitlist"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Button variant="link" className="self-start p-0" render={<Link href="/" />}>
        ← Back to home
      </Button>
    </main>
  );
}
