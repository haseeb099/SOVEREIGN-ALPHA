"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, RefreshCw, Settings2, Trash2 } from "lucide-react";
import type { AlertRule } from "@sovereign/shared";
import { deleteAlertRule, fetchAlertRules, saveAlertRule } from "@/lib/api";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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
import { toast } from "sonner";

const emptyRule: AlertRule = {
  ticker: "TSLA",
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
};

export default function SettingsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [form, setForm] = useState<AlertRule>(emptyRule);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    try {
      setRules(await fetchAlertRules());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
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
      toast.error(e instanceof Error ? e.message : "Sign in to save alert rules");
    } finally {
      setSaving(false);
    }
  };

  const clearLocalCache = () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sovereign-")) keys.push(key);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    toast.success(`Cleared ${keys.length} cached items`);
  };

  const onDelete = async (id: string) => {
    try {
      await deleteAlertRule(id);
      toast.success("Rule deleted");
      await loadRules();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <DashboardShell
      title="Settings"
      subtitle="Alerts, preferences, and data management"
      onRefresh={() => void loadRules()}
      refreshing={loading}
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Active rules"
            value={String(rules.length)}
            icon={Bell}
            loading={loading}
          />
          <KpiCard
            label="Channels"
            value={String(new Set(rules.map((r) => r.channel)).size || "—")}
            hint="email · in-app · webhook"
            icon={Settings2}
            loading={loading}
          />
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
                    <SelectItem value="thesis_score_drop">Thesis score drop</SelectItem>
                    <SelectItem value="status_change">Status change</SelectItem>
                    <SelectItem value="price_move">Price move</SelectItem>
                    <SelectItem value="earnings_7d">Earnings within 7d</SelectItem>
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
                <Label htmlFor="threshold">Threshold</Label>
                <Input
                  id="threshold"
                  type="number"
                  value={form.threshold ?? 10}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, threshold: Number(e.target.value) }))
                  }
                  className="min-h-11"
                />
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
                <Button variant="outline" size="sm" onClick={clearLocalCache}>
                  Clear local cache
                </Button>
                <Button variant="outline" size="sm" render={<Link href="/terms" />}>
                  Terms
                </Button>
                <Button variant="outline" size="sm" render={<Link href="/privacy" />}>
                  Privacy
                </Button>
              </div>
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
            ) : rules.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No rules configured"
                  description="Create an alert rule above. Sign in to persist rules across sessions."
                />
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
                          <Badge variant="outline">{r.channel}</Badge>
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
      </div>
    </DashboardShell>
  );
}
