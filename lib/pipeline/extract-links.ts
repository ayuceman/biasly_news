import "server-only";

import * as cheerio from "cheerio";
import type { SelectedSource } from "@/lib/pipeline/types";

// Homepage article link extraction (AGENTS.md §11). Collect only visible
// story/article card links from homepage content — not every anchor, nav,
// footer, or section link. Output is normalized, deduped, same-domain URLs;
// the candidate URL check (§12) and non-article reject list (§9) filter them
// further before any detail scrape.

// Containers that typically hold story cards on news homepages. We prefer
// anchors inside these; if none match we fall back to all in-content anchors.
const STORY_CONTAINER_SELECTOR = [
  "main a[href]",
  "article a[href]",
  "[class*='card'] a[href]",
  "[class*='story'] a[href]",
  "[class*='headline'] a[href]",
  "[class*='promo'] a[href]",
  "[data-testid*='card'] a[href]",
].join(", ");

// Anchors we never want, even inside content containers.
const EXCLUDE_ANCHOR_SELECTOR = [
  "nav a",
  "header a",
  "footer a",
  "[class*='nav'] a",
  "[class*='menu'] a",
  "[class*='footer'] a",
  "[class*='header'] a",
  "[class*='social'] a",
].join(", ");

function registrableHost(host: string): string {
  // Compare on the last two labels (e.g. bbc.com, reuters.com) so www / news
  // subdomains of the same site are treated as same-domain.
  const parts = host.toLowerCase().split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

function normalizeUrl(href: string, base: URL): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = ""; // strip fragments so #comments etc. don't create dupes
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extract candidate article links from a source homepage's HTML.
 * source.parser_strategy may name a hook, but generic extraction covers the
 * seeded sources; unknown sources use the generic extractor.
 */
export function extractCandidateLinks(
  html: string,
  source: SelectedSource
): string[] {
  const $ = cheerio.load(html);
  const base = new URL(source.listing_url);
  const baseRegistrable = registrableHost(base.host);

  // Anchors to exclude (nav/header/footer/social) — collected as a set of nodes.
  const excluded = new Set($(EXCLUDE_ANCHOR_SELECTOR).toArray());

  let anchors = $(STORY_CONTAINER_SELECTOR).toArray().filter((el) => !excluded.has(el));

  // Fallback: if the site markup doesn't match our container heuristics, use
  // all body anchors minus the excluded nav/footer set.
  if (anchors.length === 0) {
    anchors = $("body a[href]").toArray().filter((el) => !excluded.has(el));
  }

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const el of anchors) {
    const href = $(el).attr("href");
    if (!href) continue;

    const normalized = normalizeUrl(href, base);
    if (!normalized) continue;

    // Same registrable domain only — drop off-site links, ad partners, etc.
    let host: string;
    try {
      host = new URL(normalized).host;
    } catch {
      continue;
    }
    if (registrableHost(host) !== baseRegistrable) continue;

    // Ignore self-link back to the homepage.
    if (normalized === source.listing_url) continue;

    if (seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push(normalized);
  }

  return candidates;
}
