"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { AlertRule } from "@sovereign/shared";
import { deleteAlertRule, fetchAlertRules, saveAlertRule } from "@/lib/api";
import { AppNav, MobileBottomNav } from "@/components/layout/app-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function SettingsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [form, setForm] = useState<AlertRule>(emptyRule);

  const loadRules = async () => setRules(await fetchAlertRules());

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
    try {
      await saveAlertRule(form);
      toast.success("Alert rule saved");
      await loadRules();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in to save alert rules");
    }
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
    <div className="min-h-dvh bg-background pb-20">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="font-mono text-lg font-bold">Settings</h1>
        <AppNav className="ml-auto hidden lg:flex" />
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alert Rules</CardTitle>
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
                className="font-mono"
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
                <SelectTrigger>
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
                <SelectTrigger>
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
                  placeholder={
                    form.channel === "email" ? "you@example.com" : "https://hooks.example.com/..."
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
              />
            </div>
            <Button onClick={() => void onSave()}>Save rule</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active rules</CardTitle>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <EmptyState
                title="No rules configured"
                description="Create an alert rule above. Sign in to persist rules across sessions."
              />
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {rules.map((r) => (
                  <li
                    key={r.id ?? `${r.ticker}-${r.condition}`}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 font-mono text-xs"
                  >
                    <span>
                      {r.ticker} — {r.condition} via {r.channel}
                      {r.destination ? ` (${r.destination})` : ""}
                    </span>
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
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
      <MobileBottomNav />
    </div>
  );
}
