import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PricingCancelPage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 p-6 py-20 text-center">
      <h1 className="font-mono text-2xl font-bold">Checkout canceled</h1>
      <p className="text-sm text-muted-foreground">
        No charges were made. You can continue with Personal (free) or try Pro again anytime.
      </p>
      <div className="flex gap-3">
        <Button render={<Link href="/pricing" />}>Back to pricing</Button>
        <Button variant="outline" render={<Link href="/terminal" />}>
          Open terminal
        </Button>
      </div>
    </main>
  );
}
