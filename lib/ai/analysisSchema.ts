import { z } from "zod";

/**
 * Zod schema for the structured JSON response from Gemini.
 * Matches the prompt template in §5 of the project brief exactly.
 */
export const AnalysisSchema = z.object({
  summary: z.string(),
  category: z.enum([
    "exam",
    "tuition",
    "event",
    "admission",
    "administrative",
    "result",
    "other",
  ]),
  priority: z.enum(["high", "medium", "low"]),
  deadline: z.string().nullable().optional(),
  affectedGroups: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
  requiresPayment: z.boolean().optional(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
