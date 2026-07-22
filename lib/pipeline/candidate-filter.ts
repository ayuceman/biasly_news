import "server-only";

import { isNonArticleUrl } from "@/lib/pipeline/reject-list";
import type { SelectedSource } from "@/lib/pipeline/types";

// Candidate URL filtering (AGENTS.md §12). A candidate is kept only when it
// looks like a real article DETAIL URL for its source. When uncertain, prefer
// the stricter choice and reject before spending an Oxylabs detail request.

const YEAR_IN_PATH = /\/(19|20)\d{2}\//; // date-based article paths
const LONG_NUMERIC_ID = /\/\d{6,}(?:[/.-]|$)/; // article-specific numeric IDs
const LONG_SLUG = /[a-z0-9]+(?:-[a-z0-9]+){3,}/i; // multi-word story slugs

// Source-specific article URL shapes for the seeded sources (§11 examples).
// Each returns true only for real article detail URLs, false for section/
// category/show/live/game pages.
const SOURCE_ARTICLE_MATCHERS: Record<string, (u: URL) => boolean> = {
  // Reuters: /world/us/<slug>-YYYY-MM-DD/ ; reject bare /world/africa sections.
  reuters: (u) => /-20\d{2}-\d{2}-\d{2}\/?$/.test(u.pathname) || LONG_SLUG.test(u.pathname),
  // NPR: /YYYY/MM/DD/<id>/<slug> ; reject /sections/politics.
  npr: (u) => YEAR_IN_PATH.test(u.pathname) && !u.pathname.startsWith("/sections/"),
  // BBC: /news/articles/<id> or /news/<section>-<numericId> ; reject /sport, /live.
  "bbc news": (u) =>
    /\/news\/articles\/[a-z0-9]+/i.test(u.pathname) ||
    /\/news\/[a-z-]+-\d{6,}/i.test(u.pathname),
  // Fox News: /<section>/<slug> long slug ; reject /shows, /games, /live.
  "fox news": (u) => LONG_SLUG.test(u.pathname),
  // Guardian: /<section>/YYYY/mon/DD/<slug> ; reject /us/environment sections.
  "the guardian": (u) => /\/(19|20)\d{2}\/[a-z]{3}\/\d{1,2}\//i.test(u.pathname),
};

function matchesGenericArticleShape(u: URL): boolean {
  return (
    YEAR_IN_PATH.test(u.pathname) ||
    LONG_NUMERIC_ID.test(u.pathname) ||
    LONG_SLUG.test(u.pathname)
  );
}

/**
 * True when the candidate URL looks like a real article detail page for the
 * source. Applies the non-article reject list first (§9), then a source-
 * specific matcher when known, else a generic article-shape heuristic (§12).
 */
export function isLikelyArticleUrl(
  rawUrl: string,
  source: SelectedSource
): boolean {
  if (isNonArticleUrl(rawUrl)) return false;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Path must have enough structure to be an article (not a top-level section).
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return false;

  const key = source.name.trim().toLowerCase();
  const matcher = SOURCE_ARTICLE_MATCHERS[key];
  if (matcher) return matcher(parsed);

  return matchesGenericArticleShape(parsed);
}
