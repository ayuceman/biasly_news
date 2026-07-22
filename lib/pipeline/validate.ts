import "server-only";

import { z } from "zod";

// Zod schema for the validated article insert shape + raw_text cleanup
// helpers (AGENTS.md §13). Insert only what passes this schema.

export const articleCandidateSchema = z.object({
  original_url: z.string().url(),
  canonical_url: z.string().url().nullable(),
  title: z.string().min(1),
  image_url: z.string().url(),
  // ISO datetime; coerced/validated upstream in parse-article.
  published_at: z.string().min(1),
  raw_text: z.string().min(1),
});

export type ValidatedArticleCandidate = z.infer<typeof articleCandidateSchema>;

// Generic titles that indicate a listing/section/show/error page, not an article.
const GENERIC_TITLE_PATTERNS: readonly RegExp[] = [
  /^(home|homepage)$/i,
  /^(news|latest news|breaking news|top stories)$/i,
  /^(video|videos|watch|live|livestream)$/i,
  /^(sport|sports|business|politics|world|us|uk|technology|entertainment)$/i,
  /^(shows?|programs?|programmes?|podcasts?)$/i,
  /^(search|search results)$/i,
  /^(page not found|404|error|access denied)$/i,
  /^(subscribe|newsletter|sign in|log in)$/i,
];

export function isGenericTitle(title: string): boolean {
  const trimmed = title.trim();
  if (trimmed.length < 8) return true;
  return GENERIC_TITLE_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Clean extracted body text so it reads like one article (§13): collapse
 * excess whitespace, drop obvious boilerplate lines, and keep paragraph
 * separation as blank lines.
 */
export function cleanRawText(paragraphs: string[]): string {
  const BOILERPLATE = [
    /sign up (for|to)/i,
    /subscribe/i,
    /newsletter/i,
    /follow us/i,
    /share this/i,
    /read more/i,
    /related( articles| stories)?:/i,
    /most (read|viewed|popular)/i,
    /advertisement/i,
    /^by\s+\w+/i,
    /all rights reserved/i,
    /cookies?/i,
    /terms of (use|service)/i,
  ];

  return paragraphs
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0)
    .filter((p) => !BOILERPLATE.some((re) => re.test(p)))
    .join("\n\n")
    .trim();
}

const MIN_PARAGRAPHS = 3;
const MIN_BODY_CHARS = 900;

/**
 * Article content gate (§13). Body passes when it has ≥3 meaningful
 * paragraphs OR ≥900 clean characters. Callers must also have already
 * confirmed image URL, published date, article-specific URL, non-generic title.
 */
export function passesBodyGate(paragraphs: string[], cleaned: string): boolean {
  const meaningful = paragraphs.filter((p) => p.trim().length >= 40);
  if (meaningful.length >= MIN_PARAGRAPHS) return true;
  return cleaned.length >= MIN_BODY_CHARS;
}
