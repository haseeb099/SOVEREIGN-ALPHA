"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SignUpPage() {
  if (!hasClerk) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="font-mono text-xl font-semibold">Create account</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Clerk is not configured for local dev. Use the terminal demo without an account.
        </p>
        <Button render={<Link href="/terminal/TSLA/memo?demo=1" />}>Open live demo</Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </main>
  );
}
