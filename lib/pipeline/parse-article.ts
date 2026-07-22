import "server-only";

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ArticleCandidate, RejectionReason, SelectedSource } from "@/lib/pipeline/types";
import {
  articleCandidateSchema,
  cleanRawText,
  isGenericTitle,
  passesBodyGate,
} from "@/lib/pipeline/validate";

// Article detail page parsing + validation (AGENTS.md §13). Returns either a
// validated ArticleCandidate or a typed rejection reason. Never throws for
// bad content — parse errors become a "parse_error" rejection.

export type ParseResult =
  | { ok: true; article: ArticleCandidate }
  | { ok: false; reason: RejectionReason };

// Elements stripped before body/text extraction so raw_text reads like one
// article, not a page dump (§13).
const STRIP_SELECTOR = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "iframe",
  "figure figcaption",
  "[class*='newsletter']",
  "[class*='subscribe']",
  "[class*='subscription']",
  "[class*='related']",
  "[class*='most-read']",
  "[class*='most-popular']",
  "[class*='social']",
  "[class*='share']",
  "[class*='advert']",
  "[class*='promo']",
  "[class*='sidebar']",
  "[id*='comments']",
].join(", ");

function extractTitle($: CheerioAPI): string {
  const og = $("meta[property='og:title']").attr("content");
  if (og && og.trim()) return og.trim();
  const h1 = $("h1").first().text();
  if (h1 && h1.trim()) return h1.trim();
  return $("title").text().trim();
}

function extractImage($: CheerioAPI, base: URL): string | null {
  const candidates = [
    $("meta[property='og:image']").attr("content"),
    $("meta[name='twitter:image']").attr("content"),
    $("article img[src]").first().attr("src"),
    $("figure img[src]").first().attr("src"),
  ];
  for (const c of candidates) {
    if (!c || !c.trim()) continue;
    try {
      const url = new URL(c.trim(), base);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function extractPublishedAt($: CheerioAPI): string | null {
  const metaCandidates = [
    $("meta[property='article:published_time']").attr("content"),
    $("meta[name='article:published_time']").attr("content"),
    $("meta[property='og:article:published_time']").attr("content"),
    $("meta[name='pubdate']").attr("content"),
    $("meta[name='date']").attr("content"),
    $("time[datetime]").first().attr("datetime"),
  ];
  for (const c of metaCandidates) {
    const iso = toIso(c);
    if (iso) return iso;
  }

  // JSON-LD datePublished fallback.
  const ldNodes = $("script[type='application/ld+json']").toArray();
  for (const node of ldNodes) {
    const raw = $(node).contents().text();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const iso = findDatePublished(parsed);
      if (iso) return iso;
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return null;
}

function findDatePublished(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findDatePublished(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const direct = obj.datePublished ?? obj.dateCreated;
  const iso = toIso(typeof direct === "string" ? direct : undefined);
  if (iso) return iso;
  if (Array.isArray(obj["@graph"])) {
    return findDatePublished(obj["@graph"]);
  }
  return null;
}

function toIso(value: string | undefined | null): string | null {
  if (!value || !value.trim()) return null;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function extractCanonical($: CheerioAPI, base: URL): string | null {
  const href = $("link[rel='canonical']").attr("href");
  if (!href || !href.trim()) return null;
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return null;
  }
}

function extractParagraphs($: CheerioAPI): string[] {
  // Prefer paragraphs inside the article body; fall back to all <p>.
  const scoped = $("article p, main p, [class*='article-body'] p, [itemprop='articleBody'] p");
  const source = scoped.length > 0 ? scoped : $("p");
  const paragraphs = source
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);

  if (paragraphs.length > 1) return paragraphs;

  // If extraction returned one large paragraph, split on sentence boundaries
  // so the body gate can evaluate it (§13).
  if (paragraphs.length === 1) {
    const single = paragraphs[0];
    const sentences = single.match(/[^.!?]+[.!?]+(\s|$)/g);
    if (sentences && sentences.length > 1) {
      return sentences.map((s) => s.trim()).filter(Boolean);
    }
    return [single];
  }
  return [];
}

/**
 * Parse a scraped article detail page and validate it (§13). `url` is the URL
 * that was scraped; `source` provides context. Returns a validated candidate
 * or a typed rejection reason.
 */
export function parseArticle(
  html: string,
  url: string,
  _source: SelectedSource
): ParseResult {
  void _source;
  let $: CheerioAPI;
  let base: URL;
  try {
    $ = cheerio.load(html);
    base = new URL(url);
  } catch {
    return { ok: false, reason: "parse_error" };
  }

  const title = extractTitle($);
  const image = extractImage($, base);
  const publishedAt = extractPublishedAt($);
  const canonical = extractCanonical($, base);

  // Extract body BEFORE stripping so image/date/canonical (in <head>) are read,
  // then strip boilerplate for text.
  $(STRIP_SELECTOR).remove();
  const paragraphs = extractParagraphs($);
  const cleaned = cleanRawText(paragraphs);

  // Required-field gates (§13). Order chosen so the most specific reason wins.
  if (!image) return { ok: false, reason: "missing_image" };
  if (!publishedAt) return { ok: false, reason: "missing_published_date" };
  if (!title || isGenericTitle(title)) return { ok: false, reason: "generic_title" };
  if (!passesBodyGate(paragraphs, cleaned)) return { ok: false, reason: "thin_body" };

  const candidate: ArticleCandidate = {
    original_url: url,
    canonical_url: canonical,
    title: title.trim(),
    image_url: image,
    published_at: publishedAt,
    raw_text: cleaned,
  };

  const parsed = articleCandidateSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: "non_article_page" };

  return { ok: true, article: parsed.data };
}
