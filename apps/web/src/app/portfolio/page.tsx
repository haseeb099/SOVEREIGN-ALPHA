"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { HoldingSchema, type Holding, type PortfolioSummary } from "@sovereign/shared";
import {
  deletePortfolioHolding,
  fetchMarketSearch,
  fetchPortfolioHoldings,
  fetchPortfolioSummary,
  importPortfolioCsv,
  savePortfolioHolding,
} from "@/lib/api";
import { AppNav, MobileBottomNav } from "@/components/layout/app-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type FormErrors = Partial<Record<"ticker" | "shares" | "cost_basis", string>>;

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [form, setForm] = useState({ ticker: "", shares: "", cost_basis: "" });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [suggestions, setSuggestions] = useState<{ ticker: string; name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [summaryStale, setSummaryStale] = useState(false);
  const portfolioCacheKey = "sovereign-portfolio-summary";

  const refresh = async () => {
    setLoading(true);
    setSummaryLoading(true);
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
        /* ignore quota */
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
      await refresh();
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
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onCsv = async (file: File) => {
    try {
      const result = await importPortfolioCsv(file);
      toast.success(`Imported ${result.count} holdings`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed — use CSV: ticker,shares,cost_basis");
    }
  };

  const displayHoldings = summary?.holdings.length ? summary.holdings : holdings;

  return (
    <div className="min-h-dvh bg-background pb-20">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="font-mono text-lg font-bold">Portfolio</h1>
        <AppNav className="ml-auto hidden lg:flex" />
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-2xl font-bold">
                    ${summary?.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "0.00"}
                  </p>
                  {summaryStale && (
                    <Badge variant="outline" className="text-[10px] text-status-degraded">
                      Stale
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Hedge Quality</CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="font-mono text-2xl font-bold">
                  {summary?.hedge_quality_score?.toFixed(0) ?? "—"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Holding</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="relative">
                <Label htmlFor="ticker">Ticker</Label>
                <Input
                  id="ticker"
                  value={form.ticker}
                  onChange={(e) => onTickerChange(e.target.value)}
                  className="min-h-11 font-mono"
                  aria-invalid={!!formErrors.ticker}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CSV Import</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Format: ticker, shares, cost_basis (header row required)
            </p>
            <Label className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40">
              <FileUp />
              Upload CSV
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onCsv(f);
                }}
              />
            </Label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : displayHoldings.length === 0 ? (
              <EmptyState
                title="No holdings yet"
                description="Add a holding above or import a CSV. Sign in to persist across sessions."
                actionLabel="Scroll to form"
                onAction={() => document.getElementById("ticker")?.focus()}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {displayHoldings.map((h) => (
                  <div
                    key={`${h.id ?? h.ticker}-${h.account_label ?? "default"}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="font-mono font-semibold">{h.ticker}</span>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                      <span>{h.shares} sh</span>
                      {h.market_value != null && (
                        <span>${h.market_value.toLocaleString()}</span>
                      )}
                      {h.weight_pct != null && (
                        <Badge variant="outline">{h.weight_pct.toFixed(1)}%</Badge>
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <MobileBottomNav />
    </div>
  );
}
