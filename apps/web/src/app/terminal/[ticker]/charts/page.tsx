"use client";

import { useTerminal } from "@/providers/terminal-provider";
import { TerminalLayoutGrid } from "@/components/terminal/terminal-layout-grid";

export default function ChartsPage() {
  const { ticker } = useTerminal();
  return <TerminalLayoutGrid ticker={ticker} />;
}
