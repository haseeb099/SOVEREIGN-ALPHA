import Link from "next/link";

export default function SecurityPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-mono text-2xl font-bold">Security & Trust</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          How Sovereign-Alpha protects your data and supports compliance programs.
        </p>
      </div>
      <section className="space-y-2 text-sm">
        <h2 className="font-mono font-semibold">Access control</h2>
        <p className="text-muted-foreground">
          Clerk authentication with organization-scoped RBAC (Admin, Analyst, Viewer). All tenant
          data is filtered by org_id and user_id at the API layer.
        </p>
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="font-mono font-semibold">Audit & observability</h2>
        <p className="text-muted-foreground">
          Append-only audit events with checksum chaining for analyze runs, approvals, and admin
          actions. Sentry error tracking and Prometheus metrics on /metrics.
        </p>
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="font-mono font-semibold">Compliance documentation</h2>
        <ul className="list-inside list-disc text-muted-foreground">
          <li>
            <Link href="https://github.com" className="text-primary hover:underline">
              docs/compliance/security-policy.md
            </Link>
          </li>
          <li>docs/compliance/access-control-policy.md</li>
          <li>docs/compliance/incident-response.md</li>
          <li>docs/compliance/control-matrix.md</li>
        </ul>
      </section>
      <p className="text-xs text-muted-foreground">
        See also <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </main>
  );
}
