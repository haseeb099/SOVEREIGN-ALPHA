"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  GitCompare,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const ClerkAuthSlot = hasClerk
  ? dynamic(
      () =>
        import("@/components/layout/clerk-auth-slot").then((m) => m.ClerkAuthSlot),
      { ssr: false },
    )
  : null;

const NAV = [
  { href: "/terminal", label: "Terminal", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: BarChart3 },
  { href: "/compare", label: "Compare", icon: GitCompare },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex items-center gap-0.5", className)}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
      {hasClerk && ClerkAuthSlot && (
        <div className="ml-2 flex items-center border-l border-border pl-2">
          <ClerkAuthSlot />
        </div>
      )}
    </nav>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur lg:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="hidden max-w-full truncate text-[9px] font-medium uppercase tracking-wide sm:block">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
