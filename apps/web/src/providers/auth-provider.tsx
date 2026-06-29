"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const ClerkAuthProvider = hasClerk
  ? dynamic(
      () =>
        import("@/providers/clerk-auth-provider").then((m) => m.ClerkAuthProvider),
      { ssr: false },
    )
  : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!ClerkAuthProvider) {
    return <>{children}</>;
  }
  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}
