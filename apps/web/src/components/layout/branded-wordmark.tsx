"use client";

import Link from "next/link";
import { useBranding } from "@/providers/branding-provider";
import { cn } from "@/lib/utils";

export function BrandedWordmark({ className }: { className?: string }) {
  const branding = useBranding();
  return (
    <Link
      href="/terminal"
      className={cn("font-mono text-sm font-semibold tracking-tight text-primary", className)}
    >
      {branding.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logo_url} alt={branding.product_name} className="h-5 w-auto" />
      ) : (
        branding.product_name
      )}
    </Link>
  );
}
