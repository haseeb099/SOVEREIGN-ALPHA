"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  FileUp,
  GitCompare,
  PieChart,
  Plus,
  Shield,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { HoldingSchema, type Holding, type PortfolioSummary } from "@sovereign/shared";
import {
  deletePortfolioHolding,
  fetchMarketSearch,
  fetchPortfolioHoldings,
  fetchPortfolioSummary,
  importPortfolioCsv,
  savePortfolioHolding,
} from "@/lib/api";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { formatUsd } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FormErrors = Partial<Record<"ticker" | "shares" | "cost_basis", string>>;

function SectorBar({ label, weight }: { label: string; weight: number }) {
  const pct = Math.min(100, Math.max(0, weight * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [form, setForm] = useState({ ticker: "", shares: "", cost_basis: "" });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [suggestions, setSuggestions] = useState<{ ticker: string; name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [summaryStale, setSummaryStale] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const portfolioCacheKey = "sovereign-portfolio-summary";

  const refresh = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setSummaryLoading(true);
    } else {
      setRefreshing(true);
    }
    setSummaryStale(false);
    const [holdingsData, summaryData] = await Promise.all([
      fetchPortfolioHoldings(),
      fetchPortfolioSummary(),
    ]);
    setHoldings(holdingsData);
    if (summaryData) {
      setSummary(summaryData);
      try {
        localStorage.setItem(portfolioCacheKey, JSON.stringify(summaryData));
      } catch {
        /* ignore */
      }
    } else {
      try {
        const cached = localStorage.getItem(portfolioCacheKey);
        if (cached) {
          setSummary(JSON.parse(cached) as PortfolioSummary);
          setSummaryStale(true);
        } else {
          setSummary(null);
        }
      } catch {
        setSummary(null);
      }
    }
    setLoading(false);
    setSummaryLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onTickerChange = (value: string) => {
    const upper = value.toUpperCase();
    setForm((f) => ({ ...f, ticker: upper }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (upper.length < 1) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await fetchMarketSearch(upper);
      setSuggestions(results);
    }, 300);
  };

  const onSave = async () => {
    const parsed = HoldingSchema.safeParse({
      ticker: form.ticker,
      shares: Number(form.shares),
      cost_basis: form.cost_basis ? Number(form.cost_basis) : undefined,
    });
    if (!parsed.success) {
      const errs: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (key) errs[key] = issue.message;
      }
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      await savePortfolioHolding(parsed.data);
      toast.success("Holding saved");
      setForm({ ticker: "", shares: "", cost_basis: "" });
      await refresh(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in to save holdings");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deletePortfolioHolding(id);
      toast.success("Holding deleted");
      await refresh(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onCsv = async (file: File) => {
    try {
      const result = await importPortfolioCsv(file);
      toast.success(`Imported ${result.count} holdings`);
      await refresh(true);
      if (csvInputRef.current) csvInputRef.current.value = "";
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Import failed — use CSV: ticker,shares,cost_basis",
      );
    }
  };

  const displayHoldings = summary?.holdings.length ? summary.holdings : holdings;

  const compareTickers = useMemo(
    () => displayHoldings.map((h) => h.ticker).join(","),
    [displayHoldings],
  );

  const totalPnl = useMemo(
    () =>
      displayHoldings.reduce((sum, h) => sum + (h.unrealized_pnl ?? 0), 0),
    [displayHoldings],
  );

  const sectorEntries = useMemo(() => {
    if (!summary?.sector_weights) return [];
    return Object.entries(summary.sector_weights)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [summary?.sector_weights]);

  const AddHoldingForm = (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Label htmlFor="ticker">Ticker</Label>
          <Input
            id="ticker"
            value={form.ticker}
            onChange={(e) => onTickerChange(e.target.value)}
            className="min-h-11 font-mono"
            aria-invalid={!!formErrors.ticker}
            placeholder="TSLA"
          />
          {formErrors.ticker && (
            <p className="mt-1 text-xs text-destructive">{formErrors.ticker}</p>
          )}
          {suggestions.length > 0 && (
            <div className="absolute top-full z-10 mt-1 w-full rounded-md border bg-popover shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.ticker}
                  type="button"
                  className="flex w-full flex-col px-2 py-2 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    setForm((f) => ({ ...f, ticker: s.ticker }));
                    setSuggestions([]);
                  }}
                >
                  <span className="font-mono font-semibold">{s.ticker}</span>
                  {s.name && <span className="text-muted-foreground">{s.name}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="shares">Shares</Label>
          <Input
            id="shares"
            type="number"
            min="0"
            step="any"
            value={form.shares}
            onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
            className="min-h-11"
            aria-invalid={!!formErrors.shares}
          />
          {formErrors.shares && (
            <p className="mt-1 text-xs text-destructive">{formErrors.shares}</p>
          )}
        </div>
        <div>
          <Label htmlFor="cost">Cost basis ($)</Label>
          <Input
            id="cost"
            type="number"
            min="0"
            step="0.01"
            value={form.cost_basis}
            onChange={(e) => setForm((f) => ({ ...f, cost_basis: e.target.value }))}
            className="min-h-11"
          />
        </div>
      </div>
      <Button onClick={() => void onSave()} disabled={saving} className="min-h-11">
        <Plus />
        {saving ? "Saving…" : "Save holding"}
      </Button>
      <div className="border-t border-border/40 pt-3">
        <p className="mb-2 text-[10px] text-muted-foreground">
          CSV format: ticker, shares, cost_basis (header required)
        </p>
        <Label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 text-sm text-muted-foreground hover:bg-muted/40">
          <FileUp className="size-4" />
          Import CSV
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onCsv(f);
            }}
          />
        </Label>
      </div>
    </div>
  );

  return (
    <DashboardShell
      title="Portfolio"
      subtitle="Holdings, allocation, and hedge quality — synced when signed in"
      onRefresh={() => void refresh(true)}
      refreshing={refreshing}
      actions={
        <>
          {compareTickers && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              render={<Link href={`/compare?tickers=${encodeURIComponent(compareTickers)}`} />}
            >
              <GitCompare className="size-3.5" />
              Compare all
            </Button>
          )}
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger render={<Button size="sm" className="gap-1.5" />}>
              <Plus className="size-3.5" />
              Add holding
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Add holding</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{AddHoldingForm}</div>
            </SheetContent>
          </Sheet>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {/* KPI row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total value"
            value={formatUsd(summary?.total_value, true)}
            hint={summaryStale ? "Showing cached data" : undefined}
            icon={Briefcase}
            loading={summaryLoading}
            variant={summaryStale ? "warn" : "default"}
          />
          <KpiCard
            label="Hedge quality"
            value={
              summary?.hedge_quality_score != null
                ? summary.hedge_quality_score.toFixed(0)
                : "—"
            }
            hint="0–100 risk-adjusted score"
            icon={Shield}
            loading={summaryLoading}
            variant={
              summary?.hedge_quality_score != null && summary.hedge_quality_score >= 60
                ? "live"
                : "default"
            }
          />
          <KpiCard
            label="Holdings"
            value={String(displayHoldings.length)}
            icon={PieChart}
            loading={loading}
          />
          <KpiCard
            label="Unrealized P&L"
            value={formatUsd(totalPnl, true)}
            hint={totalPnl !== 0 ? (totalPnl > 0 ? "Net gain" : "Net loss") : undefined}
            icon={TrendingUp}
            loading={loading}
            variant={totalPnl > 0 ? "live" : totalPnl < 0 ? "warn" : "default"}
          />
        </div>

        {/* Alerts + allocation */}
        <div className="grid gap-4 lg:grid-cols-3">
          {summary?.concentration_flags && summary.concentration_flags.length > 0 && (
            <Card className="border-status-degraded/30 bg-status-degraded/5 lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-status-degraded">
                  <AlertTriangle className="size-4" />
                  Concentration alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {summary.concentration_flags.map((flag) => (
                    <li key={flag} className="rounded border border-status-degraded/20 px-2 py-1.5">
                      {flag}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {sectorEntries.length > 0 && (
            <Card
              className={cn(
                "border-border/60 bg-card/40",
                summary?.concentration_flags?.length ? "lg:col-span-2" : "lg:col-span-3",
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sector allocation</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {sectorEntries.map(([sector, weight]) => (
                  <SectorBar key={sector} label={sector} weight={weight} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Holdings table */}
        <Card className="overflow-hidden terminal-panel ring-0">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border py-2">
            <CardTitle className="panel-label">Holdings</CardTitle>
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" />
              Add
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : displayHoldings.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No holdings yet"
                  description="Add a holding or import a CSV. Sign in to persist across sessions."
                  actionLabel="Add first holding"
                  onAction={() => setAddOpen(true)}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="terminal-table w-full min-w-[640px] text-left">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th className="text-right">Shares</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Mkt Value</th>
                      <th className="text-right">Weight</th>
                      <th className="text-right">P&amp;L</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {displayHoldings.map((h) => (
                      <tr
                        key={`${h.id ?? h.ticker}-${h.account_label ?? "default"}`}
                      >
                        <td>
                          <Link
                            href={`/terminal/${h.ticker}/memo`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {h.ticker}
                          </Link>
                          {h.asset_class && (
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {h.asset_class}
                            </span>
                          )}
                        </td>
                        <td className="text-right">{h.shares}</td>
                        <td className="text-right">
                          {h.current_price != null ? formatUsd(h.current_price) : "—"}
                        </td>
                        <td className="text-right">
                          {h.market_value != null ? formatUsd(h.market_value) : "—"}
                        </td>
                        <td className="text-right">
                          {h.weight_pct != null ? (
                            <Badge variant="outline" className="font-mono">
                              {h.weight_pct.toFixed(1)}%
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className={cn(
                            "text-right",
                            (h.unrealized_pnl ?? 0) > 0
                              ? "ticker-up"
                              : (h.unrealized_pnl ?? 0) < 0
                                ? "ticker-down"
                                : "",
                          )}
                        >
                          {h.unrealized_pnl != null ? formatUsd(h.unrealized_pnl) : "—"}
                        </td>
                        <td className="text-right">
                          {h.id && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void onDelete(h.id!)}
                              aria-label={`Delete ${h.ticker}`}
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Desktop add panel */}
        <Card className="hidden border-border/60 bg-card/40 lg:block">
          <CardHeader>
            <CardTitle className="text-sm">Add holding / Import</CardTitle>
          </CardHeader>
          <CardContent>{AddHoldingForm}</CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
