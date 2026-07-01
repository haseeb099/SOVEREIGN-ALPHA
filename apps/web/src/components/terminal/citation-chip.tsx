"use client";

import Link from "next/link";
import type { Citation } from "@sovereign/shared";
import { cn } from "@/lib/utils";

export function CitationChip({
  citation,
  className,
}: {
  citation: Citation;
  className?: string;
}) {
  const label = citation.source_label || citation.source_type;
  const href =
    citation.url ||
    (citation.chunk_id?.startsWith("market-")
      ? undefined
      : `/library?cite=${encodeURIComponent(citation.chunk_id || label)}`);

  const inner = (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground",
        className,
      )}
      title={`${citation.data_point} (${citation.source_date})`}
    >
      <span className="truncate">{label}</span>
      <span className="text-foreground/70">·</span>
      <span className="truncate text-foreground/80">{citation.data_point}</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="hover:opacity-80" target={citation.url ? "_blank" : undefined}>
        {inner}
      </Link>
    );
  }
  return inner;
}

export function CitationChipList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {citations.map((c, i) => (
        <CitationChip key={`${c.source_label}-${i}`} citation={c} />
      ))}
    </div>
  );
}
