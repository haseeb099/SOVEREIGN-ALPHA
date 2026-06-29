import { FanChart, VerdictCards } from "@/components/terminal/memo-panel";
import { ThesisTrackerPanel } from "@/components/terminal/thesis-tracker-panel";
import { fetchReport, getApiBase } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let report: Awaited<ReturnType<typeof fetchReport>> | null = null;
  let error: string | null = null;

  try {
    report = await fetchReport(id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Report not found";
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-6 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Sovereign-Alpha Report
        </p>
        <h1 className="mt-1 font-mono text-2xl font-bold">
          {report?.ticker ?? "Shared Report"}
        </h1>
        {report?.created_at && (
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(report.created_at).toLocaleString()}
          </p>
        )}
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        {error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {error}
              <p className="mt-2 text-xs">
                API: <code className="font-mono">{getApiBase()}/api/reports/{id}</code>
              </p>
            </CardContent>
          </Card>
        ) : report ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Executive Summary</CardTitle>
                <Badge variant="outline" className="font-mono">
                  {report.analysis.memo.rating}
                </Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {report.analysis.memo.summary}
              </CardContent>
            </Card>
            <FanChart
              memo={report.analysis.memo}
              spot={report.analysis.asset_price}
              ticker={report.ticker}
            />
            <VerdictCards memo={report.analysis.memo} rawAgents={report.analysis.raw_agents} />
            <ThesisTrackerPanel
              points={report.analysis.thesis_points}
              ticker={report.ticker}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}
