"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, RefreshCw, Settings2, Trash2 } from "lucide-react";
import type { AlertNotification, AlertRule, FilingWatchSubscription, WatcherStatus } from "@sovereign/shared";
import {
  deleteAlertRule,
  fetchAlertNotifications,
  fetchAlertRules,
  fetchFlatfilesStatus,
  fetchWatcherStatus,
  pollWatchersNow,
  saveAlertRule,
  subscribeFilingWatcher,
  unsubscribeFilingWatcher,
} from "@/lib/api";
import { authRequiredMessage, classifyFetchError, toastApiError } from "@/lib/api-errors";
import { AuthGate, useAuthState } from "@/components/auth/auth-gate";
import { PlanGate } from "@/components/auth/plan-gate";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ApiErrorState } from "@/components/ui/api-error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const emptyRule: AlertRule = {
  ticker: "",
  condition: "thesis_score_drop",
  channel: "email",
  threshold: 10,
  destination: "",
};

const CONDITION_LABELS: Record<AlertRule["condition"], string> = {
  thesis_score_drop: "Thesis score drop",
  status_change: "Status change",
  price_move: "Price move",
  earnings_7d: "Earnings within 7d",
  new_filing: "New SEC filing",
  insider_activity: "Insider activity",
  unusual_options: "Unusual options flow",
};

const CHANNEL_LABELS: Record<AlertRule["channel"], string> = {
  email: "Email",
  in_app: "In-app",
  webhook: "Webhook",
};

export default function SettingsPage() {
  const { persistMessage } = useAuthState();
  const { isPro } = useBillingStatus();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [form, setForm] = useState<AlertRule>(emptyRule);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [flatfilesStatus, setFlatfilesStatus] = useState<{
    configured: boolean;
    connected?: boolean;
    detail?: string;
  } | null>(null);
  const [cacheDialogOpen, setCacheDialogOpen] = useState(false);
  const [cacheKeys, setCacheKeys] = useState<string[]>([]);
  const [flatfilesRefreshing, setFlatfilesRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [flatfilesTestResult, setFlatfilesTestResult] = useState<string | null>(null);
  const [rulesTestResult, setRulesTestResult] = useState<string | null>(null);
  const [s3DetailsOpen, setS3DetailsOpen] = useState(false);
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatus | null>(null);
  const [watcherTicker, setWatcherTicker] = useState("");
  const [watcherLoading, setWatcherLoading] = useState(false);
  const [watcherSaving, setWatcherSaving] = useState(false);

  const loadRules = async (options?: { suppressErrorToast?: boolean }): Promise<void> => {
    setLoading(true);
    setAuthError(false);
    setLoadError(null);
    try {
      setRules(await fetchAlertRules());
      setNotifications(await fetchAlertNotifications());
    } catch (e) {
      const err = classifyFetchError(e);
      if (err.kind === "auth") {
        setAuthError(true);
        setRules([]);
        setNotifications([]);
      } else {
        setLoadError(err);
        if (!options?.suppressErrorToast) {
          toastApiError(err);
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const refreshFlatfilesStatus = async () => {
    setFlatfilesRefreshing(true);
    try {
      const data = await fetchFlatfilesStatus();
      setFlatfilesStatus({
        configured: data.configured,
        connected: data.connected ?? data.status === "ok",
        detail: data.detail,
      });
      setFlatfilesTestResult(
        data.connected ?? data.status === "ok" ? "✓ Connection successful" : "✗ Not connected",
      );
    } catch {
      setFlatfilesStatus(null);
      setFlatfilesTestResult("✗ Connection failed");
    } finally {
      setFlatfilesRefreshing(false);
    }
  };

  const refreshWatcherStatus = async () => {
    setWatcherLoading(true);
    try {
      setWatcherStatus(await fetchWatcherStatus());
    } catch {
      setWatcherStatus(null);
    } finally {
      setWatcherLoading(false);
    }
  };

  useEffect(() => {
    void loadRules().catch(() => {});
    void refreshFlatfilesStatus();
    void refreshWatcherStatus();
  }, []);

  const onSave = async () => {
    if (form.channel === "email" && !form.destination?.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (form.channel === "webhook" && !form.destination?.startsWith("http")) {
      toast.error("Enter a valid webhook URL");
      return;
    }
    setSaving(true);
    try {
      await saveAlertRule(form);
      toast.success("Alert rule saved");
      setForm({ ...emptyRule, ticker: form.ticker });
      await loadRules();
    } catch (e) {
      const err = classifyFetchError(e);
      toastApiError(err, {
        message: err.kind === "auth" ? authRequiredMessage() : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const openClearCacheDialog = () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sovereign-")) keys.push(key);
    }
    setCacheKeys(keys);
    setCacheDialogOpen(true);
  };

  const clearLocalCache = () => {
    cacheKeys.forEach((k) => localStorage.removeItem(k));
    toast.success(`Cleared ${cacheKeys.length} cached items`);
    setCacheDialogOpen(false);
  };

  const onDelete = async (id: string) => {
    try {
      await deleteAlertRule(id);
      toast.success("Rule deleted");
      await loadRules();
    } catch (e) {
      toastApiError(e, { message: "Delete failed" });
    }
  };

  return (
    <DashboardShell
      title="Settings"
      subtitle="Alerts, preferences, and data management"
      onRefresh={() => loadRules({ suppressErrorToast: true })}
      refreshing={loading}
    >
      <div className="flex flex-col gap-6">
        <PlanGate feature="alerts">
        <AuthGate show={authError}>
        {loadError != null && !loading && (
          <ApiErrorState error={loadError} onRetry={() => void loadRules()} />
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Active rules"
            value={loading ? "—" : String(rules.length)}
            icon={Bell}
            loading={loading}
          />
          <button
            type="button"
            className="text-left"
            onClick={() =>
              document.getElementById("notifications")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <KpiCard
              label="Channels"
              value={loading ? "—" : String(new Set(rules.map((r) => r.channel)).size || "0")}
              hint="See notifications section below"
              icon={Settings2}
              loading={loading}
            />
          </button>
          <KpiCard
            label="Local cache"
            value="Browser"
            hint="Scenario & copilot per ticker"
            loading={false}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Create alert rule</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <Label htmlFor="alert-ticker">Ticker</Label>
                <Input
                  id="alert-ticker"
                  value={form.ticker}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))
                  }
                  className="min-h-11 font-mono"
                  placeholder="e.g. AAPL"
                />
              </div>
              <div>
                <Label>Condition</Label>
                <Select
                  value={form.condition}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      condition: v as AlertRule["condition"],
                    }))
                  }
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CONDITION_LABELS) as AlertRule["condition"][]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {CONDITION_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel</Label>
                <Select
                  value={form.channel}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, channel: v as AlertRule["channel"] }))
                  }
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="in_app">In-app</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(form.channel === "email" || form.channel === "webhook") && (
                <div>
                  <Label htmlFor="destination">
                    {form.channel === "email" ? "Email address" : "Webhook URL"}
                  </Label>
                  <Input
                    id="destination"
                    type={form.channel === "email" ? "email" : "url"}
                    value={form.destination ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, destination: e.target.value }))
                    }
                    className="min-h-11"
                    placeholder={
                      form.channel === "email"
                        ? "you@example.com"
                        : "https://hooks.example.com/..."
                    }
                  />
                </div>
              )}
              <div>
                <Label htmlFor="threshold">Threshold (percentage points)</Label>
                <Input
                  id="threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={form.threshold ?? 10}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, threshold: Number(e.target.value) }))
                  }
                  className="min-h-11"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  e.g. 10 = alert when thesis score drops 10 points
                </p>
              </div>
              <Button onClick={() => void onSave()} disabled={saving} className="min-h-11">
                {saving ? "Saving…" : "Save rule"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Preferences</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Scenario sliders and copilot chat persist locally per ticker. Portfolio
                holdings and alert rules sync when signed in.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={openClearCacheDialog}>
                  Clear local cache
                </Button>
                <Link
                  href="/terms"
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted/50"
                >
                  Terms
                </Link>
                <Link
                  href="/privacy"
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted/50"
                >
                  Privacy
                </Link>
                <Link
                  href="/settings/workspaces"
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted/50"
                >
                  Workspaces
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/60 bg-card/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">SEC Filing Watcher</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={watcherLoading}
                onClick={() => void refreshWatcherStatus()}
              >
                <RefreshCw className={watcherLoading ? "animate-spin" : ""} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-xs">
              {!isPro ? (
                <p className="text-muted-foreground">SEC filing watcher — coming soon on Pro.</p>
              ) : watcherStatus == null ? (
                <p className="text-muted-foreground">SEC filing watcher — Coming soon.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={watcherStatus.enabled ? "text-status-live" : ""}>
                      {watcherStatus.enabled ? "Polling active" : "Polling disabled"}
                    </Badge>
                    {watcherStatus.last_poll_at && (
                      <span className="text-muted-foreground">
                        Last poll {watcherStatus.last_poll_at}
                      </span>
                    )}
                  </div>
                  {watcherStatus.tickers_monitored && watcherStatus.tickers_monitored.length > 0 && (
                    <p className="text-muted-foreground">
                      Monitoring {watcherStatus.tickers_monitored.length} ticker(s):{" "}
                      <span className="font-mono">
                        {watcherStatus.tickers_monitored.slice(0, 8).join(", ")}
                        {watcherStatus.tickers_monitored.length > 8 ? "…" : ""}
                      </span>
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={watcherTicker}
                      onChange={(e) => setWatcherTicker(e.target.value.toUpperCase())}
                      placeholder="Ticker to watch"
                      className="min-h-9 font-mono"
                      aria-label="Filing watcher ticker"
                    />
                    <Button
                      size="sm"
                      className="min-h-9"
                      disabled={watcherSaving || !watcherTicker.trim()}
                      onClick={async () => {
                        setWatcherSaving(true);
                        try {
                          await subscribeFilingWatcher(watcherTicker.trim());
                          toast.success(`Watching filings for ${watcherTicker.trim()}`);
                          setWatcherTicker("");
                          await refreshWatcherStatus();
                        } catch (e) {
                          toastApiError(classifyFetchError(e));
                        } finally {
                          setWatcherSaving(false);
                        }
                      }}
                    >
                      {watcherSaving ? "Subscribing…" : "Subscribe"}
                    </Button>
                  </div>
                  {(watcherStatus.subscriptions?.length ?? 0) > 0 && (
                    <ul className="space-y-1.5">
                      {watcherStatus.subscriptions!.map((sub: FilingWatchSubscription) => (
                        <li
                          key={sub.id}
                          className="flex items-center justify-between rounded border border-border/50 px-2 py-1.5"
                        >
                          <div>
                            <span className="font-mono font-semibold">{sub.ticker}</span>
                            <span className="ml-2 text-muted-foreground">
                              {sub.forms.join(", ")}
                            </span>
                            {!sub.enabled && (
                              <Badge variant="outline" className="ml-2 text-[9px]">
                                Paused
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove watcher for ${sub.ticker}`}
                            onClick={async () => {
                              try {
                                await unsubscribeFilingWatcher(sub.id);
                                toast.success(`Removed watcher for ${sub.ticker}`);
                                await refreshWatcherStatus();
                              } catch (e) {
                                toastApiError(classifyFetchError(e));
                              }
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={async () => {
                      try {
                        await pollWatchersNow();
                        toast.success("Manual poll triggered");
                        await refreshWatcherStatus();
                      } catch (e) {
                        toastApiError(classifyFetchError(e));
                      }
                    }}
                  >
                    Poll now
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm">Bulk Market Data (S3)</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {flatfilesStatus == null ? (
                <p>Status unavailable — backend offline?</p>
              ) : flatfilesStatus.configured ? (
                <div className="flex flex-col gap-2">
                  <p>
                    Configured ·{" "}
                    {flatfilesStatus.connected ? "connected" : "not connected"}
                    {flatfilesStatus.detail ? ` — ${flatfilesStatus.detail}` : ""}
                  </p>
                  <button
                    type="button"
                    className="text-left text-primary hover:underline"
                    onClick={() => setS3DetailsOpen((v) => !v)}
                  >
                    {s3DetailsOpen ? "Hide" : "Show"} details
                  </button>
                  {s3DetailsOpen && (
                    <p className="leading-relaxed">
                      Massive flat files provide S3 bulk historical market data (CSV/GZIP) for
                      backtesting and offline chart fallbacks.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    disabled={flatfilesRefreshing}
                    onClick={() => void refreshFlatfilesStatus()}
                  >
                    <RefreshCw className={flatfilesRefreshing ? "animate-spin" : ""} />
                    Test connection
                  </Button>
                  {flatfilesTestResult && (
                    <p className="font-mono text-[11px]">{flatfilesTestResult}</p>
                  )}
                </div>
              ) : (
                <p>Not configured — set MASSIVE_S3_* in .env for bulk historical data.</p>
              )}
            </CardContent>
          </Card>

          <Card id="notifications" className="border-border/60 bg-card/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Notifications</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void loadRules();
                  setRulesTestResult(
                    rules.length > 0
                      ? `✓ ${rules.length} rule(s) loaded`
                      : "✗ No rules configured",
                  );
                }}
              >
                Test rules
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-xs">
              {rulesTestResult && (
                <p className="font-mono text-[11px]">{rulesTestResult}</p>
              )}
              {notifications.length === 0 ? (
                <p className="text-muted-foreground">No active alerts — rules evaluate on analyze.</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="rounded border border-border/50 px-2 py-1.5"
                  >
                    <span className="font-mono font-semibold">{n.ticker}</span>
                    <span className="text-muted-foreground"> — {n.message}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border-border/60 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 py-3">
            <CardTitle className="text-sm font-medium">Active rules</CardTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void loadRules()}
              aria-label="Refresh rules"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-4 text-xs text-muted-foreground">Loading rules…</p>
            ) : rules.length === 0 && notifications.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No alerts configured"
                  description={`Create a rule above to receive notifications. ${persistMessage}`}
                />
              </div>
            ) : rules.length === 0 ? (
              <div className="p-4">
                <p className="text-xs text-muted-foreground">
                  No active rules — notifications will appear here when rules fire.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Ticker</th>
                      <th className="p-3 font-medium">Condition</th>
                      <th className="p-3 font-medium">Channel</th>
                      <th className="p-3 font-medium">Threshold</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr
                        key={r.id ?? `${r.ticker}-${r.condition}`}
                        className="border-t border-border/40"
                      >
                        <td className="p-3 font-mono font-semibold">{r.ticker}</td>
                        <td className="p-3">{CONDITION_LABELS[r.condition]}</td>
                        <td className="p-3">
                          <Badge variant="outline">{CHANNEL_LABELS[r.channel]}</Badge>
                        </td>
                        <td className="p-3 font-mono">{r.threshold ?? "—"}</td>
                        <td className="p-3 text-right">
                          {r.id && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void onDelete(r.id!)}
                              aria-label="Delete rule"
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
        </AuthGate>
        </PlanGate>

        <Dialog open={cacheDialogOpen} onOpenChange={setCacheDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear local cache?</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              This removes {cacheKeys.length} item(s) including scenario sliders and copilot chat
              history stored in this browser.
            </p>
            {cacheKeys.length > 0 && (
              <ul className="max-h-32 overflow-y-auto text-[10px] font-mono text-muted-foreground">
                {cacheKeys.slice(0, 12).map((k) => (
                  <li key={k}>{k}</li>
                ))}
                {cacheKeys.length > 12 && <li>…and {cacheKeys.length - 12} more</li>}
              </ul>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCacheDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={clearLocalCache}>
                Clear {cacheKeys.length} items
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
