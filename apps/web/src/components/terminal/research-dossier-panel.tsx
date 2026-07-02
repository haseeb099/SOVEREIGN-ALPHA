"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, BarChart2 } from "lucide-react";
import type {
  AgentTrace,
  AnalyzeResponse,
  CompetitiveResearchResult,
  PeerComparisonRow,
  ResearchAgentName,
  ResearchResults,
} from "@sovereign/shared";
import { CompetitiveResearchResultSchema } from "@sovereign/shared";
import { CitationChipList } from "@/components/terminal/citation-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RESEARCH_AGENT_ORDER: ResearchAgentName[] = [
  "COMPANY_RESEARCH",
  "SECTOR_MACRO",
  "COMPETITIVE",
  "ESG",
  "INSIDER",
  "OPTIONS_FLOW",
];

const RESEARCH_LABELS: Record<ResearchAgentName, string> = {
  COMPANY_RESEARCH: "Company Research",
  SECTOR_MACRO: "Sector & Macro",
  COMPETITIVE: "Competitive Analysis",
  ESG: "ESG & Compliance",
  INSIDER: "Insider Sentiment",
  OPTIONS_FLOW: "Options Flow",
};

const RAW_KEY_MAP: Record<ResearchAgentName, string[]> = {
  COMPANY_RESEARCH: ["company_research", "research_company"],
  SECTOR_MACRO: ["sector_macro", "sector_macro_research"],
  COMPETITIVE: ["competitive", "competitive_analysis"],
  ESG: ["esg", "esg_compliance"],
  INSIDER: ["insider", "insider_sentiment"],
  OPTIONS_FLOW: ["options_flow"],
};

function confidenceClass(score: number): string {
  if (score >= 7) return "text-thesis-intact";
  if (score >= 4) return "text-status-degraded";
  return "text-thesis-broken";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function pickText(data: Record<string, unknown>): string | undefined {
  for (const key of ["summary", "verdict", "headline", "log_message", "analysis"]) {
    const val = data[key];
    if (typeof val === "string" && val.trim()) return val;
  }
  return undefined;
}

function pickList(data: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const val = data[key];
    if (Array.isArray(val)) {
      return val.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
}

function resolveResearchResults(analysis: AnalyzeResponse): ResearchResults {
  if (analysis.research_results && typeof analysis.research_results === "object") {
    return analysis.research_results;
  }
  const raw = analysis.raw_agents;
  if (!raw || typeof raw !== "object") return {};
  const out: ResearchResults = {};
  for (const agent of RESEARCH_AGENT_ORDER) {
    for (const key of RAW_KEY_MAP[agent]) {
      const data = (raw as Record<string, unknown>)[key];
      if (data && typeof data === "object") {
        out[key] = data;
        break;
      }
    }
  }
  return out;
}

function resolveResearchTraces(analysis: AnalyzeResponse): AgentTrace[] {
  if (analysis.research_traces?.length) return analysis.research_traces;
  const all = analysis.agent_traces ?? [];
  return all.filter((t) =>
    RESEARCH_AGENT_ORDER.includes(t.agent as ResearchAgentName),
  );
}

function getAgentResult(
  results: ResearchResults,
  agent: ResearchAgentName,
): Record<string, unknown> | null {
  for (const key of RAW_KEY_MAP[agent]) {
    const data = results[key];
    const record = asRecord(data);
    if (record) return record;
  }
  return null;
}

function getAgentTrace(
  traces: AgentTrace[],
  agent: ResearchAgentName,
): AgentTrace | undefined {
  return traces.find((t) => t.agent === agent);
}

function parseCompetitiveResult(
  results: ResearchResults,
): CompetitiveResearchResult | null {
  for (const key of RAW_KEY_MAP.COMPETITIVE) {
    const data = results[key];
    if (!data) continue;
    const parsed = CompetitiveResearchResultSchema.safeParse(data);
    if (parsed.success) return parsed.data;
    const record = asRecord(data);
    if (record) {
      const peers = record.peer_matrix ?? record.peers;
      if (Array.isArray(peers) && peers.length > 0) {
        return { peers: peers as PeerComparisonRow[], ...record };
      }
    }
  }
  return null;
}

function formatMetric(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(1) : "—";
  return String(value);
}

function peerMetric(row: PeerComparisonRow, ...keys: (keyof PeerComparisonRow)[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val != null && val !== "") return formatMetric(val);
  }
  return "—";
}

export function CompetitivePeerTable({
  competitive,
  subjectTicker,
}: {
  competitive: CompetitiveResearchResult;
  subjectTicker?: string;
}) {
  const rows = competitive.peer_matrix ?? competitive.peers ?? [];
  if (!rows.length) return null;

  const labHref =
    subjectTicker != null ? `/terminal/${subjectTicker.toUpperCase()}/lab` : null;

  return (
    <div className="overflow-x-auto">
      {labHref && (
        <div className="mb-2 flex justify-end">
          <Link
            href={labHref}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Open in Lab →
          </Link>
        </div>
      )}
      <table className="w-full min-w-[520px] text-left text-[11px]">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            <th className="p-2 font-medium">Ticker</th>
            <th className="p-2 font-medium">Rev Growth</th>
            <th className="p-2 font-medium">Gross Margin</th>
            <th className="p-2 font-medium">Op Margin</th>
            <th className="p-2 font-medium">Valuation</th>
            <th className="p-2 font-medium">Mkt Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.ticker}
              className={cn(
                "border-t border-border/40",
                subjectTicker &&
                  row.ticker.toUpperCase() === subjectTicker.toUpperCase() &&
                  "bg-primary/5",
              )}
            >
              <td className="p-2 font-mono font-semibold">
                {row.ticker}
                {row.name && (
                  <span className="ml-1 font-normal text-muted-foreground">{row.name}</span>
                )}
              </td>
              <td className="p-2 font-mono">
                {peerMetric(row, "revenue_growth_pct", "revenue_growth")}
              </td>
              <td className="p-2 font-mono">
                {peerMetric(row, "gross_margin_pct", "gross_margin")}
              </td>
              <td className="p-2 font-mono">
                {peerMetric(row, "operating_margin_pct", "operating_margin")}
              </td>
              <td className="p-2 font-mono">
                {peerMetric(row, "pe_ratio", "valuation_multiple")}
              </td>
              <td className="p-2 font-mono">
                {peerMetric(row, "market_share_pct", "market_share")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResearchSection({
  agent,
  data,
  trace,
  defaultOpen,
  subjectTicker,
}: {
  agent: ResearchAgentName;
  data: Record<string, unknown> | null;
  trace?: AgentTrace;
  defaultOpen?: boolean;
  subjectTicker?: string;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const label = RESEARCH_LABELS[agent];
  const confidence = trace?.confidence;
  const summary = trace?.log_message ?? (data ? pickText(data) : undefined);
  const reasoning = trace?.reasoning_steps ?? pickList(data ?? {}, ["reasoning_steps"]);
  const citations = trace?.citations ?? [];
  const flags = pickList(data ?? {}, [
    "regulatory_flags",
    "notable_transactions",
    "strike_clusters",
    "key_risks",
  ]);
  const competitive =
    agent === "COMPETITIVE" && data
      ? parseCompetitiveResult({ competitive: data, competitive_analysis: data })
      : null;
  const insufficient = trace?.insufficient_data || Boolean(data?.insufficient_data);
  const verdict =
    data && typeof data.verdict === "string" ? data.verdict : undefined;

  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide">
          {label}
        </span>
        {confidence != null && (
          <Badge
            variant="outline"
            className={cn("ml-auto h-4 font-mono text-[9px]", confidenceClass(confidence))}
          >
            {confidence.toFixed(1)}/10
          </Badge>
        )}
        {insufficient && (
          <Badge variant="outline" className="h-4 text-[9px] text-status-degraded">
            Low data
          </Badge>
        )}
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3 pl-8 text-xs">
          {summary ? (
            <p className="text-muted-foreground">{summary}</p>
          ) : (
            <p className="text-muted-foreground italic">
              No research output for this agent yet.
            </p>
          )}
          {trace?.insufficient_reason && (
            <p className="text-[11px] text-status-degraded">{trace.insufficient_reason}</p>
          )}
          {verdict && verdict !== summary && (
            <p className="text-muted-foreground">{verdict}</p>
          )}
          {reasoning.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {reasoning.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
          {flags.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          )}
          {competitive && (
            <CompetitivePeerTable competitive={competitive} subjectTicker={subjectTicker} />
          )}
          <CitationChipList citations={citations} />
        </div>
      )}
    </div>
  );
}

export function hasResearchContent(analysis: AnalyzeResponse): boolean {
  const results = resolveResearchResults(analysis);
  const traces = resolveResearchTraces(analysis);
  return (
    Boolean(analysis.research_brief) ||
    Object.keys(results).length > 0 ||
    traces.length > 0
  );
}

export function ResearchDossierPanel({
  analysis,
  onRunResearch,
}: {
  analysis: AnalyzeResponse;
  onRunResearch?: () => void;
}) {
  const results = resolveResearchResults(analysis);
  const traces = resolveResearchTraces(analysis);
  const competitive = parseCompetitiveResult(results);
  const hasResearch = hasResearchContent(analysis);

  if (!hasResearch) {
    return (
      <EmptyState
        icon={BarChart2}
        title="No research brief yet"
        description={`Analysis completed for ${analysis.ticker} but the research pre-pass returned no data. Re-run with research enabled.`}
        actionLabel="Run Analysis with research"
        onAction={onRunResearch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {analysis.research_brief && (
        <div className="terminal-panel">
          <div className="border-b border-border px-3 py-2">
            <p className="panel-label">Research Brief</p>
            <p className="text-[10px] text-muted-foreground">
              Consolidated pre-pass context fed to the core agent pipeline.
            </p>
          </div>
          <p className="px-3 py-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {analysis.research_brief}
          </p>
        </div>
      )}

      {competitive && !traces.some((t) => t.agent === "COMPETITIVE") && (
        <div className="terminal-panel">
          <div className="border-b border-border px-3 py-2">
            <p className="panel-label">Peer Comparison</p>
          </div>
          <div className="p-3">
            <CompetitivePeerTable competitive={competitive} subjectTicker={analysis.ticker} />
          </div>
        </div>
      )}

      <div className="terminal-panel">
        <div className="border-b border-border px-3 py-2">
          <p className="panel-label">Research Agents</p>
          <p className="text-[10px] text-muted-foreground">
            Six specialized agents — expand each section for detail and citations.
          </p>
        </div>
        <div>
          {RESEARCH_AGENT_ORDER.map((agent, index) => (
            <ResearchSection
              key={agent}
              agent={agent}
              data={getAgentResult(results, agent)}
              trace={getAgentTrace(traces, agent)}
              defaultOpen={index === 0}
              subjectTicker={analysis.ticker}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function extractCompetitiveFromAnalysis(
  analysis: AnalyzeResponse,
): CompetitiveResearchResult | null {
  return parseCompetitiveResult(resolveResearchResults(analysis));
}
