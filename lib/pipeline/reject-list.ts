import "server-only";

// Canonical non-article reject list (AGENTS.md §9). Other modules import
// isNonArticleUrl instead of re-listing page types. When the list of page
// types changes, change it HERE only.

// Path segments / tokens that indicate a non-article page. Matched against the
// URL pathname split into segments, so this catches e.g. /video/... , /search .
const NON_ARTICLE_SEGMENTS: readonly string[] = [
  // category / section / topic / tag
  "category",
  "categories",
  "section",
  "sections",
  "topic",
  "topics",
  "tag",
  "tags",
  // author
  "author",
  "authors",
  "byline",
  "profile",
  "profiles",
  "people",
  // search
  "search",
  // navigation / corporate / support
  "about",
  "about-us",
  "contact",
  "contact-us",
  "help",
  "support",
  "faq",
  "terms",
  "privacy",
  "careers",
  "jobs",
  "advertise",
  "sitemap",
  "account",
  "login",
  "signin",
  "sign-in",
  "register",
  // shows / programs / podcasts
  "show",
  "shows",
  "program",
  "programs",
  "programmes",
  "podcast",
  "podcasts",
  "schedule",
  "shows-programs",
  // live
  "live",
  "livestream",
  "live-news",
  // games / puzzles
  "game",
  "games",
  "puzzle",
  "puzzles",
  "crossword",
  "sudoku",
  // product / review / shopping
  "product",
  "products",
  "shop",
  "shopping",
  "store",
  "deals",
  "review",
  "reviews",
  "best",
  // newsletter / subscription
  "newsletter",
  "newsletters",
  "subscribe",
  "subscription",
  "subscriptions",
  // video / audio hubs (video-only pages rejected unless article text present,
  // which is enforced separately during validation)
  "video",
  "videos",
  "audio",
  "gallery",
  "galleries",
  "pictures",
  "photos",
];

const NON_ARTICLE_SEGMENT_SET = new Set(NON_ARTICLE_SEGMENTS);

/**
 * True when the URL clearly points at a page type that is never a valid
 * article (§9 non-article reject list). Uncertain cases return false here and
 * are handled by the stricter candidate URL check (§12).
 */
export function isNonArticleUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true; // unparseable → not a usable article URL
  }

  const segments = parsed.pathname
    .split("/")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Homepage / near-empty path is a listing entry, never an article.
  if (segments.length === 0) return true;

  for (const segment of segments) {
    if (NON_ARTICLE_SEGMENT_SET.has(segment)) return true;
  }

  return false;
}
