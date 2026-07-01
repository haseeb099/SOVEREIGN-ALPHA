"use client";

import { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTerminal } from "@/providers/terminal-provider";
import { TerminalTabBar } from "@/components/terminal/left-sidebar";

export default function TickerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const ticker = (params.ticker ?? "TSLA").toUpperCase();
  const { setTicker, setCorpusId } = useTerminal();

  useEffect(() => {
    setTicker(ticker);
  }, [ticker, setTicker]);

  useEffect(() => {
    const corpus = searchParams.get("corpus");
    setCorpusId(corpus);
  }, [searchParams, setCorpusId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TerminalTabBar ticker={ticker} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">{children}</div>
    </div>
  );
}
