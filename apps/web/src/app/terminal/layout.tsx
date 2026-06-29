"use client";

import { TerminalProvider } from "@/providers/terminal-provider";
import { TerminalShell } from "@/components/terminal/terminal-shell";
import { useTerminal } from "@/providers/terminal-provider";
import { ErrorBoundary } from "@/components/error-boundary";

function TerminalLayoutInner({ children }: { children: React.ReactNode }) {
  const { lastUpdated } = useTerminal();
  return (
    <TerminalShell lastAnalysisAt={lastUpdated}>{children}</TerminalShell>
  );
}

export default function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TerminalProvider>
      <ErrorBoundary>
        <TerminalLayoutInner>{children}</TerminalLayoutInner>
      </ErrorBoundary>
    </TerminalProvider>
  );
}
