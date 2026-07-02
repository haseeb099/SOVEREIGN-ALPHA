import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PricingSuccessPage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 p-6 py-20 text-center">
      <h1 className="font-mono text-2xl font-bold">Welcome to Pro</h1>
      <p className="text-sm text-muted-foreground">
        Your subscription is active (or in trial). Portfolio, library, alerts, copilot, and reports are
        now unlocked.
      </p>
      <Button render={<Link href="/portfolio" />}>Open portfolio</Button>
    </main>
  );
}
