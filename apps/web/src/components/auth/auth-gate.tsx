"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { CLERK_ENABLED } from "@/lib/api-errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function useAuthState() {
  return {
    clerkEnabled: CLERK_ENABLED,
    isSignedIn: false,
    persistMessage: CLERK_ENABLED
      ? "Sign in to persist across sessions."
      : "Local session only — data stored in this browser.",
  };
}

export function AuthRequiredBanner({ className }: { className?: string }) {
  if (!CLERK_ENABLED) return null;

  return (
    <Card className={`border-primary/30 bg-primary/5 ${className ?? ""}`}>
      <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:text-left">
        <Lock className="size-8 shrink-0 text-primary" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">Sign in required</p>
          <p className="text-xs text-muted-foreground">
            Portfolio holdings, library documents, and alert rules persist when you sign in.
          </p>
        </div>
        <Button size="sm" render={<Link href="/sign-in" />}>
          Sign in
        </Button>
      </CardContent>
    </Card>
  );
}

export function AuthGate({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  if (!show || !CLERK_ENABLED) return <>{children}</>;

  return (
    <div className="flex flex-col gap-4">
      <AuthRequiredBanner />
      <div className="pointer-events-none opacity-40">{children}</div>
    </div>
  );
}
