import { z } from "zod";

// Structured-output schema for AI article analysis (AGENTS.md §19).
// The model returns camelCase fields; the pipeline maps them to the
// snake_case `article_analyses` columns and derives `bias_score` in code.
// Percentages are range-checked here and normalized to sum exactly 100 by
// `normalizeFraming` before saving — the model is only required to land close.

export const SENTIMENT_LABELS = ["positive", "neutral", "negative"] as const;
export const FRAMING_LABELS = ["left", "center", "right", "mixed", "unclear"] as const;

// Tolerance for the model's three percentages summing to 100 before we reject.
const SUM_TOLERANCE = 2;

export const analysisSchema = z
  .object({
    summary: z.string().min(1),
    sentimentScore: z.number().min(-1).max(1),
    sentimentLabel: z.enum(SENTIMENT_LABELS),
    leftPercentage: z.number().min(0).max(100),
    centerPercentage: z.number().min(0).max(100),
    rightPercentage: z.number().min(0).max(100),
    politicalFramingLabel: z.enum(FRAMING_LABELS),
    confidence: z.number().min(0).max(1),
    framingNotes: z.string().min(1),
    loadedTerms: z.array(z.string()),
    disclaimer: z.string().min(1),
  })
  .refine(
    (v) =>
      Math.abs(v.leftPercentage + v.centerPercentage + v.rightPercentage - 100) <=
      SUM_TOLERANCE,
    { message: "left/center/right percentages must sum to ~100" }
  );

export type AnalysisOutput = z.infer<typeof analysisSchema>;

/**
 * Rescale the three percentages so they sum to exactly 100 (integers), absorbing
 * any rounding drift into the largest bucket. Guarantees the §19 "sum to 100"
 * rule regardless of the model's exact numbers.
 */
export function normalizeFraming(o: AnalysisOutput): {
  left: number;
  center: number;
  right: number;
} {
  const raw = [o.leftPercentage, o.centerPercentage, o.rightPercentage];
  const total = raw[0] + raw[1] + raw[2];
  // Guard against a degenerate all-zero response.
  const scaled = total > 0 ? raw.map((n) => (n / total) * 100) : [0, 100, 0];
  const rounded = scaled.map((n) => Math.round(n));
  const drift = 100 - (rounded[0] + rounded[1] + rounded[2]);
  const maxIdx = scaled.indexOf(Math.max(...scaled));
  rounded[maxIdx] += drift;
  return { left: rounded[0], center: rounded[1], right: rounded[2] };
}
