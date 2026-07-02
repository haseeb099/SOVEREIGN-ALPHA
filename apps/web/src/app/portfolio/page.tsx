"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Briefcase, FileUp, GitCompare, Info, Pencil, PieChart, Plus, Shield, Trash2, TrendingUp } from "lucide-react";
import { HoldingSchema, type Holding, type PortfolioSummary } from "@sovereign/shared";
import {
  authRequiredMessage,
  classifyFetchError,
  toastApiError,
} from "@/lib/api-errors";
import {
  deletePortfolioHolding,
  fetchMarketSearch,
  fetchPortfolioHoldings,
  fetchPortfolioSummary,
  importPortfolioCsv,
  savePortfolioHolding,
  updatePortfolioHolding,
} from "@/lib/api";
import { AuthGate, useAuthState } from "@/components/auth/auth-gate";
import { PlanGate } from "@/components/auth/plan-gate";
import { useBillingStatus } from "@/hooks/use-billing-status";
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
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PortfolioRiskPanel } from "@/components/portfolio/portfolio-risk-panel";
import { toast } from "sonner";

type FormErrors = Partial<Record<"ticker" | "shares" | "cost_basis", string>>;

const LOCAL_HOLDINGS_KEY = "sovereign-portfolio-holdings";
const FREE_TIER_HOLDING_LIMIT = 3;

function loadLocalHoldings(): Holding[] {
  try {
    const raw = localStorage.getItem(LOCAL_HOLDINGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Holding[];
  } catch {
    return [];
  }
}

function saveLocalHoldings(holdings: Holding[]) {
  try {
    localStorage.setItem(
      LOCAL_HOLDINGS_KEY,
      JSON.stringify(holdings.slice(0, FREE_TIER_HOLDING_LIMIT)),
    );
  } catch {
    /* ignore quota */
  }
}

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
  const { persistMessage } = useAuthState();
  const { isPro } = useBillingStatus();
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
  const [editHolding, setEditHolding] = useState<Holding | null>(null);
  const [editForm, setEditForm] = useState({ shares: "", cost_basis: "" });
  const [authError, setAuthError] = useState(false);
  const [summaryStale, setSummaryStale] = useState(false);
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [editFormErrors, setEditFormErrors] = useState<FormErrors>({});
  const [usingLocalHoldings, setUsingLocalHoldings] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const portfolioCacheKey = "sovereign-portfolio-summary";

  const refresh = async (options?: {
    silent?: boolean;
    suppressErrorToast?: boolean;
  }): Promise<void> => {
    if (!options?.silent) {
      setLoading(true);
      setSummaryLoading(true);
    } else {
      setRefreshing(true);
    }
    setSummaryStale(false);
    setAuthError(false);
    try {
      const [holdingsData, summaryData] = await Promise.all([
        fetchPortfolioHoldings(),
        fetchPortfolioSummary(),
      ]);
      setHoldings(holdingsData);
      setUsingLocalHoldings(false);
      if (holdingsData.length > 0) {
        saveLocalHoldings(holdingsData);
      }
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
    } catch (e) {
      const err = classifyFetchError(e);
      if (err.kind === "auth" || !isPro) {
        const local = loadLocalHoldings();
        if (local.length > 0) {
          setHoldings(local);
          setUsingLocalHoldings(true);
          setSummary(null);
          setAuthError(err.kind === "auth");
        } else if (err.kind === "auth") {
          setAuthError(true);
          setHoldings([]);
          setSummary(null);
        }
      } else if (!options?.suppressErrorToast) {
        toastApiError(err);
      }
      if (err.kind !== "auth" && isPro) throw err;
    } finally {
      setLoading(false);
      setSummaryLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh().catch(() => {});
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
      ticker: form.ticker.toUpperCase(),
      shares: Number(form.shares),
      cost_basis: form.cost_basis ? Number(form.cost_basis) : 0,
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
    const searchResults = await fetchMarketSearch(parsed.data.ticker, 5);
    const validTicker = searchResults.some((r) => r.ticker === parsed.data.ticker);
    if (!validTicker) {
      setFormErrors({ ticker: `"${parsed.data.ticker}" is not a recognized ticker` });
      return;
    }
    setSaving(true);
    try {
      if (isPro) {
        await savePortfolioHolding(parsed.data);
      } else {
        const local = loadLocalHoldings();
        const exists = local.some((h) => h.ticker === parsed.data.ticker);
        if (!exists && local.length >= FREE_TIER_HOLDING_LIMIT) {
          toast.error(`Free tier limited to ${FREE_TIER_HOLDING_LIMIT} holdings — upgrade for more`);
          return;
        }
        const next = [
          ...local.filter((h) => h.ticker !== parsed.data.ticker),
          { ...parsed.data, id: `local-${parsed.data.ticker}` },
        ];
        saveLocalHoldings(next);
        setHoldings(next);
        setUsingLocalHoldings(true);
      }
      toast.success("Holding saved");
      setForm({ ticker: "", shares: "", cost_basis: "" });
      setAddOpen(false);
      if (isPro) await refresh({ silent: true });
    } catch (e) {
      const err = classifyFetchError(e);
      toastApiError(err, {
        message: err.kind === "auth" ? authRequiredMessage() : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      if (isPro && !id.startsWith("local-")) {
        await deletePortfolioHolding(id);
      } else {
        const next = loadLocalHoldings().filter((h) => h.id !== id && `local-${h.ticker}` !== id);
        saveLocalHoldings(next);
        setHoldings(next);
      }
      toast.success("Holding deleted");
      if (isPro) await refresh({ silent: true });
    } catch (e) {
      toastApiError(e, { message: "Delete failed" });
    }
  };

  const onEditSave = async () => {
    if (!editHolding?.id) return;
    const parsed = HoldingSchema.safeParse({
      ticker: editHolding.ticker,
      shares: Number(editForm.shares),
      cost_basis: editForm.cost_basis ? Number(editForm.cost_basis) : 0,
    });
    if (!parsed.success) {
      const errs: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (key && key !== "ticker") errs[key] = issue.message;
      }
      setEditFormErrors(errs);
      return;
    }
    setEditFormErrors({});
    try {
      if (isPro && editHolding.id && !editHolding.id.startsWith("local-")) {
        await updatePortfolioHolding(editHolding.id, {
          shares: Number(editForm.shares),
          cost_basis: editForm.cost_basis ? Number(editForm.cost_basis) : undefined,
        });
        await refresh({ silent: true });
      } else {
        const next = loadLocalHoldings().map((h) =>
          h.ticker === editHolding.ticker
            ? {
                ...h,
                shares: Number(editForm.shares),
                cost_basis: editForm.cost_basis ? Number(editForm.cost_basis) : undefined,
              }
            : h,
        );
        saveLocalHoldings(next);
        setHoldings(next);
      }
      toast.success("Holding updated");
      setEditHolding(null);
    } catch (e) {
      const err = classifyFetchError(e);
      toastApiError(err, {
        message: err.kind === "auth" ? authRequiredMessage() : undefined,
      });
    }
  };

  const onCsv = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("CSV must be under 2 MB");
      return;
    }
    setCsvUploading(true);
    try {
      const result = await importPortfolioCsv(file);
      toast.success(`Imported ${result.count} holdings`);
      await refresh({ silent: true });
      if (csvInputRef.current) csvInputRef.current.value = "";
    } catch (e) {
      toastApiError(e, {
        message:
          e instanceof Error
            ? e.message
            : "Import failed — use CSV: ticker,shares,cost_basis",
      });
    } finally {
      setCsvUploading(false);
    }
  };

  const displayHoldings = useMemo(
    () => (summary?.holdings?.length ? summary.holdings : holdings),
    [summary?.holdings, holdings],
  );

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
            placeholder="185.20"
            className="min-h-11"
          />
        </div>
      </div>
      <Button onClick={() => void onSave()} disabled={saving} className="min-h-11">
        <Plus />
        {saving ? "Saving…" : "Save holding"}
      </Button>
      <div className="border-t border-border/40 pt-3">
        <p className="mb-2 text-xs text-foreground/80">
          CSV format: ticker, shares, cost_basis (header required).{" "}
          <Link href="/templates/holdings.csv" className="text-primary hover:underline">
            Download template
          </Link>
        </p>
        <div
          className={cn(
            "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 text-sm transition-colors",
            csvDragging ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/5 hover:bg-primary/10",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setCsvDragging(true);
          }}
          onDragLeave={() => setCsvDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setCsvDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) void onCsv(f);
          }}
        >
          <Label className="flex cursor-pointer flex-col items-center gap-2 text-muted-foreground">
            <FileUp className="size-6 text-primary" />
            <span className="font-medium text-foreground">
              {csvUploading ? "Importing…" : "Drop CSV or click to upload"}
            </span>
            <span className="text-[10px]">Max 2 MB · ticker, shares, cost_basis</span>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="sr-only"
              disabled={csvUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onCsv(f);
              }}
            />
          </Label>
          {csvUploading && (
            <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 animate-pulse bg-primary" />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DashboardShell
      title="Portfolio"
      subtitle="Holdings, allocation, and hedge quality — synced when signed in"
      onRefresh={() => refresh({ silent: true, suppressErrorToast: true })}
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
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Add holding
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {usingLocalHoldings && (
          <div className="flex items-center gap-2 border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="size-3.5 shrink-0 text-primary" />
            Local holdings only (max {FREE_TIER_HOLDING_LIMIT}). Upgrade to Pro for cloud sync.
          </div>
        )}
        <PlanGate feature="portfolio">
        <AuthGate show={authError}>
        {/* KPI row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total value"
            value={summary?.total_value != null ? formatUsd(summary.total_value, true) : "N/A"}
            hint={
              summaryStale
                ? "Showing cached data"
                : summary?.total_value == null
                  ? "Add holdings to calculate"
                  : undefined
            }
            icon={Briefcase}
            loading={summaryLoading}
            variant={summaryStale ? "warn" : "default"}
          />
          <KpiCard
            label="Hedge quality"
            value={
              summary?.hedge_quality_score != null
                ? summary.hedge_quality_score.toFixed(0)
                : "N/A"
            }
            infoHint="Measures portfolio diversification and hedge effectiveness across sectors and asset classes (0–100)."
            icon={Shield}
            loading={summaryLoading}
            variant={
              summary?.hedge_quality_score != null && summary.hedge_quality_score >= 60
                ? "live"
                : "default"
            }
            className="relative"
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

        <PortfolioRiskPanel />

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
                  description={`Add a holding or import a CSV. ${persistMessage}`}
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
                          <div className="flex justify-end gap-1">
                            {h.id && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => {
                                  setEditHolding(h);
                                  setEditForm({
                                    shares: String(h.shares),
                                    cost_basis: h.cost_basis != null ? String(h.cost_basis) : "",
                                  });
                                }}
                                aria-label={`Edit ${h.ticker}`}
                              >
                                <Pencil />
                              </Button>
                            )}
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </AuthGate>
        </PlanGate>

        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Add holding</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{AddHoldingForm}</div>
          </SheetContent>
        </Sheet>

        <Sheet open={!!editHolding} onOpenChange={(open) => !open && setEditHolding(null)}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Edit {editHolding?.ticker}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <Label htmlFor="edit-shares">Shares</Label>
                <Input
                  id="edit-shares"
                  type="number"
                  min="0"
                  step="any"
                  value={editForm.shares}
                  onChange={(e) => setEditForm((f) => ({ ...f, shares: e.target.value }))}
                  className="min-h-11"
                  aria-invalid={!!editFormErrors.shares}
                />
                {editFormErrors.shares && (
                  <p className="mt-1 text-xs text-destructive">{editFormErrors.shares}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-cost">Cost basis</Label>
                <div className="relative">
                  <span className="absolute top-3 left-3 text-sm text-muted-foreground">$</span>
                  <Input
                    id="edit-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="185.20"
                    value={editForm.cost_basis}
                    onChange={(e) => setEditForm((f) => ({ ...f, cost_basis: e.target.value }))}
                    className="min-h-11 pl-7"
                    aria-invalid={!!editFormErrors.cost_basis}
                  />
                </div>
                {editFormErrors.cost_basis && (
                  <p className="mt-1 text-xs text-destructive">{editFormErrors.cost_basis}</p>
                )}
              </div>
              <Button onClick={() => void onEditSave()} className="min-h-11">
                Save changes
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Desktop add panel */}
        {displayHoldings.length > 0 && (
        <Card className="hidden border-border/60 bg-card/40 lg:block">
          <CardHeader>
            <CardTitle className="text-sm">Add holding / Import</CardTitle>
          </CardHeader>
          <CardContent>{AddHoldingForm}</CardContent>
        </Card>
        )}
      </div>
    </DashboardShell>
  );
}
