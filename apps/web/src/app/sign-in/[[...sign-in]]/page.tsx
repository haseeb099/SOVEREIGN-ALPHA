"use client";

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SignInPage() {
  if (!hasClerk) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="font-mono text-xl font-semibold">Sign in</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Clerk is not configured for local dev. Use the terminal demo without signing in.
        </p>
        <Button render={<Link href="/terminal/TSLA/memo?demo=1" />}>Open live demo</Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </main>
  );
}
