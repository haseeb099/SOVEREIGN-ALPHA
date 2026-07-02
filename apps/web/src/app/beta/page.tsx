import { Suspense } from "react";
import BetaPageClient from "./beta-client";

export default function BetaPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading…</main>}>
      <BetaPageClient />
    </Suspense>
  );
}
