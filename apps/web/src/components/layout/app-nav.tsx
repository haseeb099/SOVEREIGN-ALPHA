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
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const ClerkAuthSlot = hasClerk
  ? dynamic(
      () =>
        import("@/components/layout/clerk-auth-slot").then((m) => m.ClerkAuthSlot),
      { ssr: false },
    )
  : null;

export const NAV = [
  {
    href: "/terminal",
    label: "Terminal",
    subtitle: "Research & scenario lab",
    icon: LayoutDashboard,
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    subtitle: "Holdings & risk",
    icon: BarChart3,
  },
  {
    href: "/compare",
    label: "Compare",
    subtitle: "Multi-ticker matrix",
    icon: GitCompare,
  },
  {
    href: "/library",
    label: "Library",
    subtitle: "Document registry",
    icon: BookOpen,
  },
  {
    href: "/settings",
    label: "Settings",
    subtitle: "Alerts & data",
    icon: Settings,
  },
] as const;

function NavLink({
  href,
  label,
  subtitle,
  icon: Icon,
  active,
  layout,
  onNavigate,
}: {
  href: string;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  active: boolean;
  layout: "horizontal" | "bottom" | "drawer";
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      title={layout === "bottom" ? label : undefined}
      onClick={onNavigate}
      className={cn(
        "transition-colors",
        layout === "horizontal" &&
          "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide",
        layout === "bottom" &&
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2",
        layout === "drawer" &&
          "flex items-start gap-3 rounded-md border border-transparent px-3 py-2.5 hover:bg-muted/50",
        active
          ? layout === "drawer"
            ? "border-primary/30 bg-primary/5 text-primary"
            : "bg-primary/10 text-primary"
          : layout === "drawer"
            ? "text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "shrink-0",
          layout === "horizontal" && "size-3.5",
          layout === "bottom" && "size-4",
          layout === "drawer" && "mt-0.5 size-4",
        )}
      />
      {layout === "drawer" ? (
        <span className="min-w-0 text-left">
          <span className="block text-sm font-medium">{label}</span>
          {subtitle && (
            <span className="block text-[11px] font-normal text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
      ) : (
        <span
          className={cn(
            layout === "bottom" &&
              "hidden max-w-full truncate text-[9px] font-medium uppercase tracking-wide sm:block",
            layout === "horizontal" && "hidden sm:inline",
          )}
        >
          {label}
        </span>
      )}
    </Link>
  );
}

/** Horizontal links for header toolbars (terminal xl+, inline rows). */
export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex items-center gap-0.5", className)} aria-label="Main">
      {NAV.map(({ href, label, subtitle, icon }) => {
        const active = pathname.startsWith(href);
        return (
          <NavLink
            key={href}
            href={href}
            label={label}
            subtitle={subtitle}
            icon={icon}
            active={active}
            layout="horizontal"
          />
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

/** Single responsive nav: fixed bottom bar on mobile, inline in header from md+. */
export function AppNavigation({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 pb-safe backdrop-blur",
        "md:static md:z-auto md:w-auto md:items-center md:gap-0.5 md:border-t-0 md:bg-transparent md:pb-0 md:backdrop-blur-none",
        className,
      )}
    >
      {NAV.map(({ href, label, subtitle, icon }) => {
        const active = pathname.startsWith(href);
        return (
          <NavLink
            key={href}
            href={href}
            label={label}
            subtitle={subtitle}
            icon={icon}
            active={active}
            layout="bottom"
            onNavigate={onNavigate}
          />
        );
      })}
      {hasClerk && ClerkAuthSlot && (
        <div className="flex items-center border-l border-border px-2 md:ml-2 md:border-l md:pl-2">
          <ClerkAuthSlot />
        </div>
      )}
    </nav>
  );
}

export function AppWordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/terminal"
      className={cn("font-mono text-sm font-semibold tracking-tight text-primary", className)}
    >
      Sovereign-Alpha
    </Link>
  );
}

/** Drawer navigation with wordmark and item subtitles. */
export function NavDrawerContent({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <AppWordmark />
      <nav className="flex flex-col gap-1" aria-label="Main">
        {NAV.map(({ href, label, subtitle, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            subtitle={subtitle}
            icon={icon}
            active={pathname.startsWith(href)}
            layout="drawer"
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      {hasClerk && ClerkAuthSlot && (
        <div className="border-t border-border pt-4">
          <ClerkAuthSlot />
        </div>
      )}
    </div>
  );
}

/** @deprecated Use AppNavigation for dashboard shells. */
export function MobileBottomNav() {
  return <AppNavigation />;
}
