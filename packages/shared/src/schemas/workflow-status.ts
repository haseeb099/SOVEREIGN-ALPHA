import { z } from "zod";
import { AnalyzeResponseSchema } from "./analyze-response";

export const WorkflowStatusEnumSchema = z.enum([
  "awaiting_approval",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type WorkflowStatusValue = z.infer<typeof WorkflowStatusEnumSchema>;

export const WorkflowStepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);
export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatusSchema>;

export const WorkflowPlanStepSchema = z.object({
  id: z.string(),
  tool: z.string(),
  params: z.record(z.unknown()).optional(),
  status: WorkflowStepStatusSchema.optional(),
  summary: z.string().optional(),
});
export type WorkflowPlanStep = z.infer<typeof WorkflowPlanStepSchema>;

export const WorkflowPlanSchema = z.object({
  ticker: z.string().optional(),
  goal_summary: z.string().optional(),
  steps: z.array(WorkflowPlanStepSchema).optional(),
});
export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;

export const WorkflowPendingCheckpointSchema = z.object({
  step: z.string(),
  summary: z.string(),
});
export type WorkflowPendingCheckpoint = z.infer<typeof WorkflowPendingCheckpointSchema>;

export const WorkflowStatusSchema = z.object({
  workflow_id: z.string(),
  status: WorkflowStatusEnumSchema,
  pending_checkpoint: WorkflowPendingCheckpointSchema.nullish(),
  plan: WorkflowPlanSchema.optional(),
  analysis: AnalyzeResponseSchema.optional(),
  report_id: z.string().optional(),
});
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
