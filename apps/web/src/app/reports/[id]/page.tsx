import { ReportPasswordGate } from "@/components/reports/report-password-gate";
import { fetchReport, getApiBase } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let report: Awaited<ReturnType<typeof fetchReport>> | null = null;
  let error: string | null = null;
  let needsPassword = false;

  try {
    report = await fetchReport(id);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err.status === 401 || String(err.message ?? "").toLowerCase().includes("password")) {
      needsPassword = true;
    } else {
      error = e instanceof Error ? e.message : "Report not found";
    }
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
        ) : (
          <ReportPasswordGate
            token={id}
            initialReport={report}
            needsPassword={needsPassword || report?.password_protected === true}
          />
        )}
      </main>
    </div>
  );
}
