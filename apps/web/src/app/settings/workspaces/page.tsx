import { WorkspacesPanel } from "@/components/settings/workspaces-panel";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function WorkspacesSettingsPage() {
  return (
    <DashboardShell
      title="Workspaces"
      subtitle="Shared theses, annotations, and approvals"
      backHref="/settings"
      showMobileNav={false}
    >
      <WorkspacesPanel />
    </DashboardShell>
  );
}
