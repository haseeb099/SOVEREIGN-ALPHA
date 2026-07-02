"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Brain, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Zap,
    title: "3-second thesis stress test",
    description:
      "Run bull/bear synthesis, red-team verdict, and sovereign score on any ticker in seconds.",
  },
  {
    icon: Brain,
    title: "Agentic research pipeline",
    description:
      "Fundamental, macro, ESG, and options-flow agents with grounded citations and audit trails.",
  },
  {
    icon: BarChart3,
    title: "Scenario lab + valuation",
    description:
      "Monte Carlo DCF, comps, LBO, and sensitivity grids — all tied to your live thesis.",
  },
  {
    icon: Shield,
    title: "Enterprise-ready",
    description:
      "RBAC, audit logs, team workspaces, and white-label branding for research desks.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-mono text-sm font-semibold tracking-tight">Sovereign-Alpha</span>
          <nav className="flex items-center gap-4 text-xs">
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            <Link href="/community" className="text-muted-foreground hover:text-foreground">
              Community
            </Link>
            <Button size="sm" variant="outline" render={<Link href="/sign-in" />}>
              Sign in
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16 text-center sm:py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">GTM Launch</p>
        <h1 className="mt-4 font-mono text-3xl font-bold tracking-tight sm:text-5xl">
          Stress-test any thesis in ~3 seconds
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Sovereign-Alpha is an AI investment intelligence OS — institutional-grade memos, scenario
          modeling, and portfolio copilot powered by Cerebras Gemma 4.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link href="/terminal/TSLA/memo?demo=1" />}>
            Launch live demo
            <ArrowRight className="ml-1 size-4" />
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/waitlist" />}>
            Join waitlist
          </Button>
        </div>
      </section>

      <section className="border-y border-border bg-muted/30 py-16">
        <div className="mx-auto grid max-w-5xl gap-4 px-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-border/60 bg-card/80">
              <CardContent className="space-y-2 p-5">
                <Icon className="size-5 text-primary" />
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="text-xs text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="font-mono text-xl font-semibold">Pro — $99/mo</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Portfolio persistence, alerts, document library, copilot, and PDF reports. 14-day trial.
          </p>
          <Button className="mt-4" render={<Link href="/pricing" />}>
            View pricing
          </Button>
        </div>
      </section>

      <section className="border-t border-border py-8">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-6 px-6 text-xs text-muted-foreground">
          <Link href="/blog/how-we-stress-test-a-tesla-thesis-in-3-seconds">Blog</Link>
          <Link href="/case-studies">Case studies</Link>
          <Link href="/beta">Beta programme</Link>
          <Link href="/enterprise">Enterprise</Link>
          <Link href="/security">Security</Link>
        </div>
      </section>
    </main>
  );
}
