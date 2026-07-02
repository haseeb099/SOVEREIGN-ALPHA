import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function TermsPage() {
  return (
    <DashboardShell
      title="Terms of Service"
      subtitle="Last updated: June 2026"
      backHref="/terminal"
      showMobileNav={false}
    >
      <article className="prose prose-invert prose-sm max-w-2xl">
        <p>
          Sovereign-Alpha provides AI-assisted investment research tools. This service is for
          informational purposes only and does not constitute financial advice.
        </p>
        <h2>Use of Service</h2>
        <p>
          You agree to use the platform responsibly and not to rely solely on automated outputs
          for investment decisions.
        </p>
        <h2>Limitation of Liability</h2>
        <p>
          We are not liable for losses arising from use of analysis, scenarios, or portfolio tools.
        </p>
      </article>
    </DashboardShell>
  );
}
