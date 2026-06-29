import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div>
        <h1 className="font-mono text-2xl font-bold">Pricing</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Plans for individual investors and research teams.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-6">
          <h2 className="font-mono text-lg font-semibold">Starter</h2>
          <p className="mt-2 text-3xl font-bold">$0</p>
          <p className="text-sm text-muted-foreground">Terminal, compare, scenario lab</p>
        </div>
        <div className="rounded-lg border border-primary/40 p-6">
          <h2 className="font-mono text-lg font-semibold">Pro</h2>
          <p className="mt-2 text-3xl font-bold">TBD</p>
          <p className="text-sm text-muted-foreground">
            Portfolio persistence, alerts, library, copilot
          </p>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Button variant="link" className="h-auto p-0" render={<Link href="/terminal" />}>
          Back to terminal
        </Button>
      </div>
    </main>
  );
}
