import { Suspense } from "react";
import ComparePage from "./compare-client";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";

function CompareFallback() {
  return (
    <DashboardShell title="Compare" subtitle="Loading analysis matrix…">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </DashboardShell>
  );
}

export default function CompareRoute() {
  return (
    <Suspense fallback={<CompareFallback />}>
      <ComparePage />
    </Suspense>
  );
}
