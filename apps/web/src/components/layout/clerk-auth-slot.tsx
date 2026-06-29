"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";

export function ClerkAuthSlot() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <UserButton />;
  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className="rounded px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Sign in
      </button>
    </SignInButton>
  );
}
