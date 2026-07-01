import { z } from "zod";

export const ReportTemplateSchema = z.enum([
  "equity_research",
  "due_diligence",
  "portfolio_review",
  "pitch_deck",
]);

export type ReportTemplate = z.infer<typeof ReportTemplateSchema>;

export const BrandingConfigSchema = z.object({
  firm_name: z.string().optional(),
  logo_url: z.string().url().optional().or(z.literal("")),
  disclaimer: z.string().optional(),
});

export type BrandingConfig = z.infer<typeof BrandingConfigSchema>;

export const ReportGenerateRequestSchema = z.object({
  ticker: z.string(),
  analysis: z.record(z.unknown()),
  template: ReportTemplateSchema.default("equity_research"),
  expires_in_days: z.number().int().min(1).max(365).default(30),
  password: z.string().optional(),
  polish: z.boolean().default(true),
  branding: BrandingConfigSchema.optional(),
  corpus_id: z.string().optional(),
  parent_report_id: z.string().optional(),
  analysis_id: z.string().optional(),
  portfolio: z.record(z.unknown()).optional(),
});

export type ReportGenerateRequest = z.infer<typeof ReportGenerateRequestSchema>;

export const ReportVersionSchema = z.object({
  id: z.string(),
  version: z.number(),
  template: ReportTemplateSchema,
  share_token: z.string(),
  created_at: z.string(),
  expires_at: z.string().nullable().optional(),
  password_protected: z.boolean(),
});

export type ReportVersion = z.infer<typeof ReportVersionSchema>;

export const ReportDiffSchema = z.object({
  rating_change: z
    .object({ from: z.string().nullable(), to: z.string().nullable() })
    .nullable()
    .optional(),
  price_target_delta: z
    .object({
      from: z.number(),
      to: z.number(),
      delta: z.number(),
    })
    .nullable()
    .optional(),
  thesis_points: z.object({
    added: z.array(z.record(z.unknown())),
    removed: z.array(z.record(z.unknown())),
    changed: z.array(
      z.object({ from: z.record(z.unknown()), to: z.record(z.unknown()) }),
    ),
  }),
  memo_sections: z.object({
    summary_diff: z.array(z.string()),
  }),
  audit_warnings: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
  }),
});

export type ReportDiff = z.infer<typeof ReportDiffSchema>;

export const CorpusExtractionSchema = z.object({
  corpus_id: z.string(),
  document_ids: z.array(z.string()),
  merged_extraction: z.object({
    ticker_guess: z.string().optional(),
    thesis_points: z.array(z.record(z.unknown())).optional(),
    key_risks: z.array(z.string()).optional(),
    target_price: z.number().optional(),
    rating: z.string().optional(),
    source_documents: z.array(z.record(z.unknown())).optional(),
  }),
});

export type CorpusExtraction = z.infer<typeof CorpusExtractionSchema>;
