"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Send, Trash2 } from "lucide-react";
import type { Holding } from "@sovereign/shared";
import { useTerminal } from "@/providers/terminal-provider";
import { fetchPortfolioSummary, streamCopilot } from "@/lib/api";
import { toastApiError } from "@/lib/api-errors";
import { formatUsd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED_PROMPTS = (ticker: string) => [
  `What is my ${ticker} exposure relative to the rest of my portfolio?`,
  `Suggest hedges if ${ticker} drops 15% in the next quarter.`,
  `Summarize the bull and bear case for ${ticker} in two sentences.`,
  `How would higher rates in the current scenario impact ${ticker}?`,
];

function copilotStorageKey(ticker: string) {
  return `sovereign-copilot-${ticker}`;
}

function loadCopilotMessages(ticker: string): Message[] {
  try {
    const raw = localStorage.getItem(copilotStorageKey(ticker));
    if (!raw) return [];
    return JSON.parse(raw) as Message[];
  } catch {
    return [];
  }
}

export function CopilotPanel() {
  const { ticker, analysis, scenario } = useTerminal();
  const [messages, setMessages] = useState<Message[]>(() => loadCopilotMessages(ticker));
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [ctxError, setCtxError] = useState(false);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [clearOpen, setClearOpen] = useState(false);
  const assistantBuf = useRef("");

  useEffect(() => {
    setMessages(loadCopilotMessages(ticker));
  }, [ticker]);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(copilotStorageKey(ticker), JSON.stringify(messages));
    } catch {
      /* ignore quota */
    }
  }, [messages, ticker]);

  useEffect(() => {
    void fetchPortfolioSummary()
      .then((summary) => {
        if (summary) {
          setHoldings(summary.holdings ?? []);
          setTotalValue(summary.total_value ?? 0);
          setCtxError(false);
        } else {
          setHoldings([]);
          setTotalValue(0);
        }
      })
      .catch(() => {
        setCtxError(true);
        setHoldings([]);
      })
      .finally(() => setCtxLoading(false));
  }, []);

  const subtitle = useMemo((): ReactNode => {
    if (ctxLoading) return null;
    if (ctxError) return "Portfolio unavailable — answers use ticker context only.";
    if (holdings.length === 0) {
      return (
        <>
          Portfolio empty —{" "}
          <Link href="/portfolio" className="text-primary hover:underline">
            add holdings
          </Link>{" "}
          for better context.
        </>
      );
    }
    return `Grounded on ${holdings.length} holdings (${formatUsd(totalValue, true)})`;
  }, [ctxLoading, ctxError, holdings.length, totalValue]);

  const send = async (queryOverride?: string) => {
    const query = (queryOverride ?? input).trim();
    if (!query || streaming) return;
    setInput("");
    setLastFailedQuery(null);
    setMessages((m) => [...m, { role: "user", content: query }]);
    setStreaming(true);
    assistantBuf.current = "";
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    const ctx = {
      holdings,
      total_value: totalValue,
      ticker,
      price: analysis?.asset_price,
      change_pct: analysis?.asset_change_pct,
      margins: scenario.margins,
      rates: scenario.rates,
      sentiment: scenario.sentiment,
      rating: analysis?.memo.rating,
    };

    await streamCopilot(
      query,
      ctx,
      (delta) => {
        assistantBuf.current += delta;
        const text = assistantBuf.current;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: text };
          return copy;
        });
      },
      () => setStreaming(false),
      (err) => {
        toastApiError(err);
        setLastFailedQuery(query);
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: `Error: ${err}` };
          return copy;
        });
        setStreaming(false);
      },
    );
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(copilotStorageKey(ticker));
    setClearOpen(false);
    toast.info("Chat history cleared");
  };

  const prompts = SUGGESTED_PROMPTS(ticker);

  return (
    <>
      <Card className="flex h-full min-h-[24rem] flex-col border-border/60 bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm">Portfolio Copilot</CardTitle>
            {ctxLoading ? (
              <Skeleton className="mt-1 h-3 w-48" />
            ) : (
              <p className="text-[10px] text-muted-foreground">
                {subtitle}{" "}
                <Link href="/portfolio" className="text-primary hover:underline">
                  → Portfolio
                </Link>
              </p>
            )}
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear chat history"
              onClick={() => setClearOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {prompts.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal px-2 py-1.5 text-left text-[10px] leading-snug"
                  disabled={streaming}
                  onClick={() => void send(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          )}
          <ScrollArea className="flex-1 rounded-md border border-border/50 bg-background/40 p-3">
            <div className="flex flex-col gap-3 text-xs leading-relaxed">
              {messages.length === 0 && (
                <p className="text-muted-foreground">
                  Ask about {ticker} exposure, hedges, or scenario impacts — or pick a prompt above.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[85%] rounded-md bg-primary/15 px-3 py-2"
                      : "max-w-[95%] text-muted-foreground"
                  }
                >
                  {m.content}
                </div>
              ))}
              {lastFailedQuery && !streaming && (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-center"
                  onClick={() => void send(lastFailedQuery)}
                >
                  Retry last message
                </Button>
              )}
            </div>
          </ScrollArea>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Label htmlFor="copilot-input" className="sr-only">
              Copilot message
            </Label>
            <Input
              id="copilot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`e.g. What's my risk exposure if ${ticker} drops 20%?`}
              disabled={streaming}
              className="min-h-11 text-xs"
            />
            <Button
              type="submit"
              size="icon"
              className="min-h-11 min-w-11"
              disabled={streaming || !input.trim()}
              aria-label="Send message"
            >
              <Send />
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear chat history?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            This removes all messages for {ticker} stored in this browser.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={clearChat}>
              Clear chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
