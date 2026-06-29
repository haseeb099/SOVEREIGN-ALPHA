"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function CommunityPage() {
  const [cards, setCards] = useState<Array<{ ticker: string; score: number; summary: string }>>([]);

  useEffect(() => {
    apiFetch<{ cards: typeof cards }>("/api/v1/public/community").then((r) => setCards(r.cards));
  }, []);

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-bold">Community Thesis</h1>
      <p className="mb-6 text-xs text-[var(--text-muted)]">Not investment advice</p>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.ticker} className="rounded border border-[var(--border-subtle)] p-4">
            <div className="flex justify-between">
              <span className="font-bold">{c.ticker}</span>
              <span className="text-[var(--status-live)]">{c.score}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{c.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
