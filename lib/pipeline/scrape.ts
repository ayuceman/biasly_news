import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchHtml } from "@/lib/pipeline/oxylabs";
import { extractCandidateLinks } from "@/lib/pipeline/extract-links";
import { isNonArticleUrl } from "@/lib/pipeline/reject-list";
import { isLikelyArticleUrl } from "@/lib/pipeline/candidate-filter";
import { parseArticle } from "@/lib/pipeline/parse-article";
import { createRunLogger } from "@/lib/pipeline/logger";
import { loadSelectedSources } from "@/lib/pipeline/sources";
import type {
  ArticleCandidate,
  HomepageHtmlProvider,
  ScrapeOptions,
  ScrapeSummary,
  SelectedSource,
} from "@/lib/pipeline/types";

// Scrape-to-insert pipeline orchestrator (AGENTS.md §9). Trigger-agnostic:
// manual scraping (§16) passes a live-Oxylabs homepage provider; the scheduler
// prompt (§18) will pass a provider backed by completed Oxylabs job HTML.

export const DEFAULT_PER_SOURCE = 5;
// Never pass more than 15 URLs to a single .in() (§9 URL existence check).
const URL_EXISTENCE_CHUNK = 15;

type RunScrapeParams = {
  options?: ScrapeOptions;
  /** Where each source's homepage HTML comes from. Defaults to live Oxylabs. */
  getHomepageHtml?: HomepageHtmlProvider;
  /** Where each detail page's HTML comes from. Defaults to live Oxylabs. */
  getDetailHtml?: (url: string) => Promise<string>;
};

const liveHomepageProvider: HomepageHtmlProvider = async (source) =>
  (await fetchHtml(source.listing_url)).html;

const liveDetailProvider = async (url: string) => (await fetchHtml(url)).html;

/**
 * Return the subset of `urls` that are NOT already stored in Supabase (checking
 * original_url and canonical_url), querying in chunks of ≤15 (§9).
 */
async function filterNewUrls(
  admin: SupabaseClient,
  urls: string[]
): Promise<string[]> {
  const existing = new Set<string>();
  for (let i = 0; i < urls.length; i += URL_EXISTENCE_CHUNK) {
    const chunk = urls.slice(i, i + URL_EXISTENCE_CHUNK);
    const [byOriginal, byCanonical] = await Promise.all([
      admin.from("articles").select("original_url").in("original_url", chunk),
      admin.from("articles").select("canonical_url").in("canonical_url", chunk),
    ]);
    if (byOriginal.error) throw new Error(byOriginal.error.message);
    if (byCanonical.error) throw new Error(byCanonical.error.message);
    for (const row of byOriginal.data ?? []) {
      if (row.original_url) existing.add(row.original_url as string);
    }
    for (const row of byCanonical.data ?? []) {
      if (row.canonical_url) existing.add(row.canonical_url as string);
    }
  }
  return urls.filter((u) => !existing.has(u));
}

/**
 * Insert one validated article, append-only. Tolerates unique-violation races
 * on original_url (returns false without throwing). Returns true on insert.
 */
async function insertArticle(
  admin: SupabaseClient,
  source: SelectedSource,
  article: ArticleCandidate
): Promise<{ inserted: boolean; duplicate: boolean }> {
  const { error } = await admin.from("articles").insert({
    source_id: source.id,
    original_url: article.original_url,
    canonical_url: article.canonical_url,
    title: article.title,
    image_url: article.image_url,
    published_at: article.published_at,
    raw_text: article.raw_text,
    // analyzed_at stays null until the analysis prompt (§19) runs.
  });
  if (!error) return { inserted: true, duplicate: false };
  // 23505 = unique_violation (concurrent insert of same original_url).
  if ((error as { code?: string }).code === "23505") {
    return { inserted: false, duplicate: true };
  }
  throw new Error(error.message);
}

/**
 * Run the manual scrape-to-insert pipeline. Loads sources, gets homepage HTML,
 * extracts + filters candidates, dedupes, scrapes detail pages, validates,
 * inserts append-only, and returns the §9 run summary.
 */
export async function runScrapePipeline(
  params: RunScrapeParams = {}
): Promise<ScrapeSummary> {
  const startedAt = Date.now();
  const options = params.options ?? {};
  const perSource = Math.max(1, options.perSource ?? DEFAULT_PER_SOURCE);
  const getHomepageHtml = params.getHomepageHtml ?? liveHomepageProvider;
  const getDetailHtml = params.getDetailHtml ?? liveDetailProvider;

  const admin = createSupabaseAdminClient();
  const log = createRunLogger(admin);

  log.event("info", "scrape_started", "Scrape started", { options });

  let sources: SelectedSource[];
  try {
    sources = await loadSelectedSources(admin, options);
  } catch (err) {
    log.event("error", "scrape_failed", (err as Error).message);
    return log.summary("failed", startedAt);
  }

  log.event("info", "sources_selected", `Selected ${sources.length} source(s)`, {
    sources: sources.map((s) => s.name),
    perSource,
  });

  for (const source of sources) {
    log.counters.sourcesChecked += 1;
    try {
      log.event("info", "source_started", `Processing ${source.name}`, {
        listing_url: source.listing_url,
      });

      // Step 2: homepage HTML.
      const homepageHtml = await getHomepageHtml(source);
      log.event("info", "homepage_fetched", `Fetched homepage for ${source.name}`);

      // Step 3: extract candidate links from story cards.
      const rawCandidates = extractCandidateLinks(homepageHtml, source);
      log.event("info", "candidates_found", `${rawCandidates.length} candidate link(s)`, {
        source: source.name,
      });

      // Step 4 + 6: reject non-article URLs / keep only likely article URLs.
      const filtered = rawCandidates.filter((url) => {
        if (isNonArticleUrl(url)) return false;
        return isLikelyArticleUrl(url, source);
      });
      const rejectedCount = rawCandidates.length - filtered.length;
      log.counters.candidatesFound += rawCandidates.length;
      log.counters.candidatesRejected += rejectedCount;
      if (rejectedCount > 0) {
        log.event("info", "candidates_rejected", `${rejectedCount} rejected before detail scrape`, {
          source: source.name,
        });
      }

      // Step 5: dedupe against Supabase (URL existence check).
      const newUrls = await filterNewUrls(admin, filtered);
      const dupCount = filtered.length - newUrls.length;
      log.counters.duplicatesSkipped += dupCount;
      if (dupCount > 0) {
        log.event("info", "duplicates_skipped", `${dupCount} already stored`, {
          source: source.name,
        });
      }

      // Steps 6–8: scrape detail pages, validate, insert until perSource met.
      let insertedForSource = 0;
      for (const url of newUrls) {
        if (insertedForSource >= perSource) break;

        let detailHtml: string;
        try {
          detailHtml = await getDetailHtml(url);
          log.counters.detailPagesScraped += 1;
        } catch (err) {
          log.counters.articlesFailed += 1;
          log.event("warn", "detail_scrape_failed", (err as Error).message, { url });
          continue;
        }

        const result = parseArticle(detailHtml, url, source);
        if (!result.ok) {
          log.counters.articlesRejected += 1;
          log.incrRejection(result.reason);
          log.event("info", "article_rejected", `Rejected (${result.reason})`, { url });
          continue;
        }

        try {
          const { inserted, duplicate } = await insertArticle(admin, source, result.article);
          if (inserted) {
            insertedForSource += 1;
            log.counters.articlesInserted += 1;
            log.event("info", "article_inserted", result.article.title, { url });
          } else if (duplicate) {
            log.counters.duplicatesSkipped += 1;
          }
        } catch (err) {
          log.counters.articlesFailed += 1;
          log.event("warn", "article_insert_failed", (err as Error).message, { url });
        }
      }

      log.event("info", "source_completed", `${insertedForSource} inserted for ${source.name}`);
    } catch (err) {
      log.event("error", "source_error", (err as Error).message, { source: source.name });
    }
  }

  log.event("info", "scrape_completed", "Scrape completed");
  return log.summary("completed", startedAt);
}
