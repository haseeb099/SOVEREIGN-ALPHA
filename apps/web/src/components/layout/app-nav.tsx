"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  GitCompare,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  CreditCard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MarketSearchResult } from "@sovereign/shared";
import { fetchMarketSearch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const ClerkAuthSlot = hasClerk
  ? dynamic(
      () =>
        import("@/components/layout/clerk-auth-slot").then((m) => m.ClerkAuthSlot),
      { ssr: false },
    )
  : null;

const OrgSwitcher = hasClerk
  ? dynamic(
      () => import("@/components/layout/org-switcher").then((m) => m.OrgSwitcher),
      { ssr: false },
    )
  : null;

const BrandedWordmark = dynamic(
  () => import("@/components/layout/branded-wordmark").then((m) => m.BrandedWordmark),
  { ssr: false },
);

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
    href: "/community",
    label: "Community",
    subtitle: "Public thesis feed",
    icon: Users,
  },
  {
    href: "/pricing",
    label: "Pricing",
    subtitle: "Personal, Pro, Enterprise",
    icon: CreditCard,
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
    <nav className={cn("flex min-w-0 flex-1 items-center gap-0.5", className)} aria-label="Main">
      <AppNavTickerSearch />
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
        <div className="ml-2 flex items-center gap-2 border-l border-border pl-2">
          {OrgSwitcher && <OrgSwitcher />}
          <ClerkAuthSlot />
        </div>
      )}
    </nav>
  );
}

function AppNavTickerSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MarketSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = (ticker: string) => {
    const upper = ticker.toUpperCase();
    setQuery("");
    setShowSuggestions(false);
    router.push(`/terminal/${upper}/memo`);
  };

  const onChange = (value: string) => {
    const upper = value.toUpperCase();
    setQuery(upper);
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (upper.length < 1) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSuggestions(await fetchMarketSearch(upper));
      setSearching(false);
    }, 300);
  };

  return (
    <div className="relative mr-1 hidden min-w-0 max-w-[9rem] lg:block xl:max-w-[11rem]">
      <Search className="absolute top-2 left-2 size-3 text-muted-foreground" aria-hidden />
      <Input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && query.trim()) {
            const results = await fetchMarketSearch(query.trim(), 5);
            const match = results.find((r) => r.ticker === query.trim()) ?? results[0];
            if (match) navigate(match.ticker);
          }
          if (e.key === "Escape") setShowSuggestions(false);
        }}
        onFocus={() => query.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder="Ticker…"
        className="h-7 pl-7 font-mono text-[10px] focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Search ticker"
        autoComplete="off"
      />
      {showSuggestions && (searching || suggestions.length > 0) && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {searching && (
            <div className="p-2 text-[10px] text-muted-foreground">Searching…</div>
          )}
          {suggestions.map((s) => (
            <button
              key={s.ticker}
              type="button"
              className="flex w-full flex-col px-2 py-1.5 text-left text-[10px] hover:bg-muted"
              onMouseDown={() => navigate(s.ticker)}
            >
              <span className="font-mono font-semibold">{s.ticker}</span>
              {s.name && <span className="truncate text-muted-foreground">{s.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
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
  return <BrandedWordmark className={className} />;
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
