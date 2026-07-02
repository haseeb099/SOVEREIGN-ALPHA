"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shield, TrendingDown } from "lucide-react";
import type { PortfolioRiskResult } from "@sovereign/shared";
import { fetchPortfolioRisk } from "@/lib/api";
import { authRequiredMessage, classifyFetchError, toastApiError } from "@/lib/api-errors";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PortfolioRiskPanel({ className }: { className?: string }) {
  const [risk, setRisk] = useState<PortfolioRiskResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    setLoading(true);
    void fetchPortfolioRisk()
      .then((data) => {
        setRisk(data);
        setAuthError(false);
      })
      .catch((e) => {
        const err = classifyFetchError(e);
        if (err.status === 401) setAuthError(true);
        else toastApiError(err, { message: "Failed to load portfolio risk" });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className={cn("border-border/60 bg-card/40", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Risk Laboratory</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  if (authError) {
    return (
      <Card className={cn("border-border/60 bg-card/40", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="size-4" /> Risk Laboratory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{authRequiredMessage()}</p>
        </CardContent>
      </Card>
    );
  }

  if (!risk) return null;

  const var95 = risk.portfolio_var_95 != null ? (risk.portfolio_var_95 * 100).toFixed(2) : "—";
  const cvar = risk.portfolio_cvar_95 != null ? (risk.portfolio_cvar_95 * 100).toFixed(2) : "—";

  return (
    <Card className={cn("border-border/60 bg-card/40 lg:col-span-3", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-primary" /> Risk Laboratory
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Portfolio VaR (95%)"
            value={`${var95}%`}
            icon={TrendingDown}
            infoHint="1-day historical value-at-risk at 95% confidence"
          />
          <KpiCard
            label="CVaR (95%)"
            value={`${cvar}%`}
            icon={TrendingDown}
            infoHint="Expected loss beyond VaR threshold"
          />
          <KpiCard
            label="Max stress loss"
            value={
              risk.max_stress_loss_pct != null ? `${risk.max_stress_loss_pct}%` : "—"
            }
            icon={TrendingDown}
          />
        </div>

        {risk.stress_scenarios.length > 0 && (
          <div className="overflow-x-auto">
            <table className="terminal-table w-full min-w-[480px] text-left text-[11px]">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="text-right">Portfolio impact</th>
                </tr>
              </thead>
              <tbody>
                {risk.stress_scenarios.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td className="text-right font-mono text-status-offline">
                      {s.portfolio_loss_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {risk.holding_contributions.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Per-holding links
            </p>
            <ul className="flex flex-wrap gap-2">
              {risk.holding_contributions.map((h) => (
                <li key={h.ticker}>
                  <Link
                    href={`/terminal/${h.ticker}/lab`}
                    className="rounded border px-2 py-1 font-mono text-[10px] hover:bg-muted"
                  >
                    {h.ticker} ({h.weight_pct.toFixed(0)}%)
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
