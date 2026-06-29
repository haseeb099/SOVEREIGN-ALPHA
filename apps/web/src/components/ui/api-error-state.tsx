"use client";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { getApiBase } from "@/lib/api";
import {
  classifyFetchError,
  friendlyErrorDescription,
  friendlyErrorTitle,
} from "@/lib/api-errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ApiErrorState({
  error,
  onRetry,
  className,
  showDevHint = process.env.NODE_ENV === "development",
  isRetrying = false,
  retryAttempt,
  nextRetryInMs,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  showDevHint?: boolean;
  isRetrying?: boolean;
  retryAttempt?: number;
  nextRetryInMs?: number | null;
}) {
  const apiError = classifyFetchError(error);
  const title = friendlyErrorTitle(apiError.kind);
  const description = friendlyErrorDescription(apiError);
  const isOffline = apiError.kind === "offline";

  return (
    <Card className={cn("border-destructive/40 bg-destructive/5", className)}>
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        {isRetrying ? (
          <Loader2 className="size-8 animate-spin text-primary" />
        ) : (
          <AlertCircle className="size-8 text-destructive" />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-destructive">
            {isRetrying && isOffline ? "We're setting things up…" : title}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">{description}</p>
          {isRetrying && retryAttempt != null && retryAttempt > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Retry attempt {retryAttempt}
              {nextRetryInMs != null && ` · next in ${Math.ceil(nextRetryInMs / 1000)}s`}
            </p>
          )}
        </div>
        {showDevHint && isOffline && (
          <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-[10px] text-muted-foreground">
            Dev: ensure API is running at {getApiBase()}
          </p>
        )}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", isRetrying && "animate-spin")} />
            {isRetrying ? "Retrying…" : "Retry now"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
