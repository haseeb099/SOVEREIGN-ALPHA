import Link from "next/link";
import { Button } from "@/components/ui/button";

const CASE_STUDIES = [
  {
    title: "Hedge fund analyst: 40% faster DD on TSLA",
    firm: "Multi-strategy fund",
    metric: "~40% time saved on initial diligence",
    summary:
      "Replaced manual memo stitching with a single agent pipeline run. Thesis tracker flags margin assumptions before the morning meeting.",
    disclaimer: "Illustrative — pending beta validation",
  },
  {
    title: "Family office: replaced 3 tools with Sovereign-Alpha",
    firm: "Single-family office",
    metric: "3 tools consolidated",
    summary:
      "Terminal, document library, and portfolio risk in one cockpit. Pro tier at $99/mo vs. legacy terminal seat costs.",
    disclaimer: "Illustrative — pending beta validation",
  },
  {
    title: "Research desk: adversarial red-team on every name",
    firm: "Boutique asset manager",
    metric: "Sub-5s re-audit on catalyst days",
    summary:
      "Red Team agent challenges bull cases automatically when filings hit. Enterprise RBAC for shared workspaces.",
    disclaimer: "Illustrative — pending beta validation",
  },
];

export default function CaseStudiesPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-mono text-2xl font-bold">Case studies</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Early outcomes from design partners. Metrics marked illustrative until beta cohort data is collected.
      </p>
      <div className="mt-8 grid gap-4">
        {CASE_STUDIES.map((study) => (
          <article key={study.title} className="rounded-lg border p-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{study.firm}</p>
            <h2 className="mt-1 font-mono text-lg font-semibold">{study.title}</h2>
            <p className="mt-2 text-2xl font-bold text-primary">{study.metric}</p>
            <p className="mt-2 text-sm text-muted-foreground">{study.summary}</p>
            <p className="mt-3 text-[10px] text-muted-foreground/80">{study.disclaimer}</p>
          </article>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button render={<Link href="/beta" />}>Apply for beta</Button>
        <Button variant="outline" render={<Link href="/enterprise" />}>
          Enterprise inquiry
        </Button>
      </div>
    </main>
  );
}
