"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { AnalyzeResponse, MemoFeedbackSection } from "@sovereign/shared";
import { submitMemoFeedback } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function resolveAnalysisId(analysis: AnalyzeResponse): string | undefined {
  const id = (analysis as Record<string, unknown>).analysis_id;
  return typeof id === "string" ? id : undefined;
}

export function thesisFeedbackSection(pointId: number): MemoFeedbackSection {
  const idx = Math.min(Math.max(pointId, 1), 5);
  return `thesis_${idx}` as MemoFeedbackSection;
}

export function SectionFeedback({
  section,
  ticker,
  analysisId,
  className,
}: {
  section: MemoFeedbackSection;
  ticker?: string;
  analysisId?: string;
  className?: string;
}) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const send = async (next: "up" | "down") => {
    setSubmitting(true);
    try {
      await submitMemoFeedback({ section, vote: next, ticker, analysis_id: analysisId });
      setVote(next);
      toast.success("Feedback recorded");
    } catch {
      toast.error("Could not save feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("size-6", vote === "up" && "text-thesis-intact")}
        disabled={submitting}
        aria-label="Thumbs up"
        onClick={() => void send("up")}
      >
        <ThumbsUp className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("size-6", vote === "down" && "text-thesis-broken")}
        disabled={submitting}
        aria-label="Thumbs down"
        onClick={() => void send("down")}
      >
        <ThumbsDown className="size-3" />
      </Button>
    </div>
  );
}
