"use client";

import { ApiErrorState } from "@/components/ui/api-error-state";

export default function LibraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <ApiErrorState error={error} onRetry={reset} />
    </div>
  );
}
