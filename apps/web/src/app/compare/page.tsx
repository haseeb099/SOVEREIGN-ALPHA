import { Suspense } from "react";
import ComparePage from "./compare-client";

export default function CompareRoute() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading compare…</p>}>
      <ComparePage />
    </Suspense>
  );
}
