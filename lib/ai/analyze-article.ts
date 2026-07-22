import "server-only";

import { z } from "zod";
import { generateObject } from "ai";
import { provider } from "@/lib/ai/openai-provider";
import {
  analysisSchema,
  ARTICLE_CATEGORIES,
  type AnalysisOutput,
  type ArticleCategory,
} from "@/lib/ai/analysis-schema";

// AI layer (AGENTS.md §5, §19): turns one article's text into a validated
// structured analysis. Uses the Vercel AI SDK with the OpenAI provider and a
// Zod schema so `generateObject` validates the model output for us; invalid
// output throws (the pipeline retries once, then marks the article failed).
// Server-only: OPENAI_API_KEY must never reach the browser (§21).

// Default model, overridable via ANALYSIS_MODEL. gpt-4o-mini is cheap and
// supports structured output; the OpenAI provider reads OPENAI_API_KEY.
const DEFAULT_MODEL = "gpt-4o-mini";

export function resolveModelName(): string {
  return process.env.ANALYSIS_MODEL || DEFAULT_MODEL;
}

// Cap the article text sent to the model to keep tokens/cost bounded.
const MAX_TEXT_CHARS = 12_000;

// Hard timeout per model call so an unreachable/slow OpenAI endpoint fails the
// article fast instead of freezing the whole batch. Overridable via env.
const ANALYSIS_TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MS) || 30_000;

const SYSTEM_PROMPT = [
  "You are a neutral media-analysis assistant.",
  "You analyze a single news article and return structured JSON only.",
  "Base every judgment strictly on the article's own text — never on the",
  "publication's name or reputation. Political framing is an AI estimate, not",
  "objective truth. Rules:",
  "- summary: a concise, neutral summary of the article.",
  "- sentimentScore: -1 (very negative) to 1 (very positive); sentimentLabel",
  "  is positive/neutral/negative and must match the score.",
  "- leftPercentage, centerPercentage, rightPercentage: numbers 0-100 that add",
  "  up to 100, estimating the article's political framing lean.",
  "- politicalFramingLabel: one of left/center/right/mixed/unclear. It should",
  "  match the strongest percentage, UNLESS confidence is low or the",
  "  percentages are close — then use mixed or unclear.",
  `- category: the single best topic category for the article, one of: ${ARTICLE_CATEGORIES.join(", ")}. Use Other only when none clearly fit.`,
  "- confidence: 0 to 1. If evidence is weak, keep confidence low and prefer",
  "  the unclear label.",
  "- framingNotes: short notes on how the article frames its subject.",
  "- loadedTerms: array of loaded or charged words/phrases found in the text",
  "  (empty array if none).",
  "- disclaimer: a one-sentence note that the framing is AI-estimated and not",
  "  objective truth.",
].join("\n");

function buildPrompt(title: string, body: string): string {
  const text = body.length > MAX_TEXT_CHARS ? body.slice(0, MAX_TEXT_CHARS) : body;
  return `Analyze the following news article.\n\nTITLE: ${title}\n\nARTICLE TEXT:\n${text}`;
}

/**
 * Generate a validated analysis for one article. Throws on transport failure or
 * when the model output does not conform to the schema (after the SDK's own
 * parsing) — callers decide whether to retry or mark the article failed.
 */
export async function analyzeArticle(
  title: string,
  body: string
): Promise<AnalysisOutput> {
  const { object } = await generateObject({
    model: provider(resolveModelName()),
    schema: analysisSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(title, body),
    // Fail fast on a hung/blocked network; cap the SDK's own backoff retries.
    abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
    maxRetries: 1,
  });
  return object;
}

// Minimal schema for the cheap category-only classifier (backfill path). Reuses
// the same fixed enum as the full analysis so values stay consistent.
const categorySchema = z.object({ category: z.enum(ARTICLE_CATEGORIES) });

const CATEGORY_SYSTEM_PROMPT = [
  "You classify a news article into exactly one topic category.",
  `Choose one of: ${ARTICLE_CATEGORIES.join(", ")}.`,
  "Use Other only when none of the categories clearly fit. Return JSON only.",
].join("\n");

/**
 * Classify one article into a single category using only its title and existing
 * neutral summary — a cheap call used to backfill categories for articles that
 * were analyzed before the category feature (no full re-analysis, no embedding).
 * Throws on transport failure or invalid output; callers retry or skip.
 */
export async function classifyCategory(
  title: string,
  summary: string
): Promise<ArticleCategory> {
  const { object } = await generateObject({
    model: provider(resolveModelName()),
    schema: categorySchema,
    system: CATEGORY_SYSTEM_PROMPT,
    prompt: `TITLE: ${title}\n\nSUMMARY: ${summary}`,
    abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
    maxRetries: 1,
  });
  return object.category;
}
