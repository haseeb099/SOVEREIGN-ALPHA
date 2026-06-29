"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { useTerminal } from "@/providers/terminal-provider";
import { fetchPortfolioSummary, streamCopilot } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };

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
  const [portfolioCtx, setPortfolioCtx] = useState<Record<string, unknown>>({});
  const [ctxLoading, setCtxLoading] = useState(true);
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
          setPortfolioCtx({
            total_value: summary.total_value,
            holdings: summary.holdings,
            sector_weights: summary.sector_weights,
            concentration_flags: summary.concentration_flags,
          });
        }
      })
      .finally(() => setCtxLoading(false));
  }, []);

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
      ...portfolioCtx,
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
        toast.error(err);
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

  return (
    <Card className="flex h-full min-h-[24rem] flex-col border-border/60 bg-card/40">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm">Portfolio Copilot</CardTitle>
          {ctxLoading ? (
            <Skeleton className="mt-1 h-3 w-32" />
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Grounded on live portfolio summary
            </p>
          )}
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear chat history"
            onClick={() => {
              setMessages([]);
              localStorage.removeItem(copilotStorageKey(ticker));
              toast.info("Chat history cleared");
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <ScrollArea className="flex-1 rounded-md border border-border/50 bg-background/40 p-3">
          <div className="flex flex-col gap-3 text-xs leading-relaxed">
            {messages.length === 0 && (
              <p className="text-muted-foreground">
                Ask about {ticker} exposure, hedges, or scenario impacts.
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
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the copilot…"
            disabled={streaming}
            className="min-h-11 text-xs"
          />
          <Button
            type="submit"
            size="icon"
            className="min-h-11 min-w-11"
            disabled={streaming || !input.trim()}
          >
            <Send />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
