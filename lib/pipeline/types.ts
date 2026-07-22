import "server-only";

import type { Source } from "@/lib/supabase/types";

// Shared pipeline types (AGENTS.md §9). Kept separate so the orchestrator,
// routes, and helper modules agree on shapes without circular imports.

/** Options accepted by the scrape route / pipeline runner (§8, §16). */
export type ScrapeOptions = {
  /** Match active sources by name (case-insensitive) or listing_url. Empty/omitted = all active. */
  sources?: string[];
  /** Max valid articles to insert per source (default DEFAULT_PER_SOURCE). */
  perSource?: number;
};

/** A source selected for a run, carrying only what the pipeline needs. */
export type SelectedSource = Pick<
  Source,
  "id" | "name" | "listing_url" | "parser_strategy"
>;

/** A parsed, validated article ready for insert (before source_id is attached). */
export type ArticleCandidate = {
  original_url: string;
  canonical_url: string | null;
  title: string;
  image_url: string;
  published_at: string; // ISO string
  raw_text: string;
};

/** Reasons a detail page can be rejected during validation (§13). */
export type RejectionReason =
  | "missing_image"
  | "missing_published_date"
  | "generic_title"
  | "thin_body"
  | "non_article_page"
  | "parse_error";

/** Final run summary object returned by the API and logged (§9 run logging). */
export type ScrapeSummary = {
  status: "completed" | "failed";
  sourcesChecked: number;
  candidatesFound: number;
  candidatesRejected: number;
  duplicatesSkipped: number;
  detailPagesScraped: number;
  articlesInserted: number;
  articlesRejected: number;
  articlesFailed: number;
  totalDurationMs: number;
  rejectionReasons: Record<string, number>;
};

/** Strategy for obtaining a source's homepage HTML — live Oxylabs fetch for
 * manual scraping (§16); the scheduler prompt (§18) passes completed job HTML. */
export type HomepageHtmlProvider = (
  source: SelectedSource
) => Promise<string>;
