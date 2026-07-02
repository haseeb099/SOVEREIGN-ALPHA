import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TeslaThesisBlogPage() {
  return (
    <main className="mx-auto max-w-2xl flex-col gap-8 p-6 prose prose-invert prose-sm">
      <Link href="/" className="text-xs text-muted-foreground no-underline hover:text-foreground">
        ← Home
      </Link>
      <h1 className="font-mono text-2xl font-bold not-prose">
        How we stress-test a Tesla thesis in 3 seconds
      </h1>
      <p className="text-muted-foreground not-prose text-sm">
        A walkthrough of Sovereign-Alpha&apos;s agent pipeline on TSLA — from scenario inputs to red-team
        verdict.
      </p>

      <section>
        <h2>The problem</h2>
        <p>
          Equity analysts spend hours stitching together filings, sell-side notes, and macro overlays
          before they can answer a simple question: does this thesis still hold under realistic stress?
        </p>
      </section>

      <section>
        <h2>Our approach</h2>
        <p>
          Sovereign-Alpha runs a parallel agent DAG — fundamental, macro, bull, red-team, and synthesis
          — grounded on live market data and retrieved document chunks. The output is an institutional
          memo with sovereign score, price distribution, and auditable thesis checkpoints.
        </p>
      </section>

      <section>
        <h2>See it live</h2>
        <p>
          Open the TSLA terminal demo to watch the memo, thesis tracker, and red-team verdict update in
          real time.
        </p>
        <Button className="not-prose mt-2" render={<Link href="/terminal/TSLA/memo?demo=1" />}>
          Launch TSLA demo
        </Button>
      </section>

      <section>
        <h2>What you get</h2>
        <ul>
          <li>Bull / bear synthesis with confidence bands</li>
          <li>Thesis tracker with pass/fail metrics</li>
          <li>Scenario lab for margins, rates, and regulatory shocks</li>
          <li>Exportable PDF research reports (Pro)</li>
        </ul>
      </section>

      <div className="not-prose flex gap-3 pt-4">
        <Button render={<Link href="/waitlist" />}>Join waitlist</Button>
        <Button variant="outline" render={<Link href="/pricing" />}>
          Start Pro trial
        </Button>
      </div>
    </main>
  );
}
