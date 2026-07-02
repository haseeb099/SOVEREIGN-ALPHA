"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function DemoModeBanner() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    setIsDemo(new URLSearchParams(window.location.search).get("demo") === "1");
  }, []);

  if (!isDemo) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs">
      <span>
        <strong>Demo mode</strong> — read-only session with pre-seeded TSLA analysis. Sign up to save work.
      </span>
      <Button size="sm" variant="outline" render={<Link href="/sign-up" />}>
        Create account
      </Button>
    </div>
  );
}
