import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function PrivacyPage() {
  return (
    <DashboardShell
      title="Privacy Policy"
      subtitle="Last updated: June 2026"
      backHref="/terminal"
      showMobileNav={false}
    >
      <article className="prose prose-invert prose-sm max-w-2xl">
        <p>
          We collect account information via Clerk when you sign in, portfolio holdings you save,
          and documents you upload for analysis.
        </p>
        <h2>Data Usage</h2>
        <p>
          Analysis requests are processed by our API and third-party AI providers. We do not sell
          personal data.
        </p>
        <h2>Contact</h2>
        <p>For privacy requests, contact your account administrator.</p>
      </article>
    </DashboardShell>
  );
}
