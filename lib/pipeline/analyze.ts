import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAnalysisLogger } from "@/lib/pipeline/logger";
import { analyzeArticle, resolveModelName } from "@/lib/ai/analyze-article";
import { embedArticle, toVectorLiteral } from "@/lib/ai/embed-article";
import { normalizeFraming, type AnalysisOutput } from "@/lib/ai/analysis-schema";
import type { AnalysisSummary, AnalyzeOptions } from "@/lib/pipeline/analysis-types";

// AI analysis pipeline orchestrator (AGENTS.md §19, §20). Detects pending
// articles (no article_analyses row — never analyzed_at alone), analyzes them in
// configurable batches with the AI layer, validates + normalizes framing,
// generates a pgvector embedding, saves both, and sets analyzed_at only after a
// valid row *with* its embedding is written. A second pass backfills embeddings
// for older analysis rows whose embedding is null (§20).

export const DEFAULT_BATCH_SIZE = 5;
// Page size for scanning articles when computing the pending set.
const SCAN_PAGE = 1000;

type PendingArticle = { id: string; title: string; raw_text: string | null };

function resolveBatchSize(options: AnalyzeOptions): number {
  if (options.batchSize && options.batchSize > 0) return options.batchSize;
  const fromEnv = Number(process.env.ANALYSIS_BATCH_SIZE);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_BATCH_SIZE;
}

/**
 * Compute the IDs of pending articles: those with NO `article_analyses` row.
 * Pages through `articles` with an `article_analyses(id)` embed and filters in
 * JS (never `.eq('foreignTable.col', …)`, §21; never `analyzed_at` alone, §19).
 * Applies the optional `articleIds` restriction and `limit` cap. Oldest first.
 */
async function getPendingArticleIds(
  admin: SupabaseClient,
  options: AnalyzeOptions
): Promise<string[]> {
  const restrict = options.articleIds ? new Set(options.articleIds) : null;
  const pending: string[] = [];

  for (let from = 0; ; from += SCAN_PAGE) {
    const { data, error } = await admin
      .from("articles")
      .select("id, article_analyses ( id )")
      .order("scraped_at", { ascending: true })
      .range(from, from + SCAN_PAGE - 1);
    if (error) throw new Error(error.message);

    const rows = (data as unknown as Array<{
      id: string;
      article_analyses: { id: string } | { id: string }[] | null;
    }> | null) ?? [];

    for (const row of rows) {
      const a = row.article_analyses;
      const hasAnalysis = Array.isArray(a) ? a.length > 0 : a !== null;
      if (hasAnalysis) continue;
      if (restrict && !restrict.has(row.id)) continue;
      pending.push(row.id);
    }

    if (rows.length < SCAN_PAGE) break;
  }

  if (options.limit && options.limit > 0) {
    return pending.slice(0, options.limit);
  }
  return pending;
}

/** Fetch title + raw_text for a batch of article IDs. */
async function loadArticles(
  admin: SupabaseClient,
  ids: string[]
): Promise<PendingArticle[]> {
  const { data, error } = await admin
    .from("articles")
    .select("id, title, raw_text")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data as PendingArticle[] | null) ?? [];
}

/**
 * Article IDs whose analysis row exists but has a null embedding (§20 backfill).
 * These are already-analyzed articles from before pgvector; they get an embedding
 * via UPDATE (never re-inserting — the article_id unique constraint would 23505).
 * Honors the optional `articleIds` restriction and `limit` cap.
 */
async function getEmbeddingBacklogIds(
  admin: SupabaseClient,
  options: AnalyzeOptions
): Promise<string[]> {
  const restrict = options.articleIds ? new Set(options.articleIds) : null;
  const backlog: string[] = [];

  for (let from = 0; ; from += SCAN_PAGE) {
    const { data, error } = await admin
      .from("article_analyses")
      .select("article_id")
      .is("embedding", null)
      .range(from, from + SCAN_PAGE - 1);
    if (error) throw new Error(error.message);

    const rows = (data as Array<{ article_id: string }> | null) ?? [];
    for (const row of rows) {
      if (restrict && !restrict.has(row.article_id)) continue;
      backlog.push(row.article_id);
    }
    if (rows.length < SCAN_PAGE) break;
  }

  if (options.limit && options.limit > 0) return backlog.slice(0, options.limit);
  return backlog;
}

/**
 * Backfill one embedding: UPDATE the existing analysis row, then set analyzed_at
 * if it is still null. Never inserts. Returns "saved" or "skipped" (no text).
 */
async function backfillEmbedding(
  admin: SupabaseClient,
  article: PendingArticle,
  embedding: string
): Promise<void> {
  const { error } = await admin
    .from("article_analyses")
    .update({ embedding })
    .eq("article_id", article.id);
  if (error) throw new Error(error.message);

  const { error: updateError } = await admin
    .from("articles")
    .update({ analyzed_at: new Date().toISOString() })
    .eq("id", article.id)
    .is("analyzed_at", null);
  if (updateError) throw new Error(updateError.message);
}

/**
 * Save one analysis row (deriving bias_score, storing the embedding) then set
 * analyzed_at. `embedding` is a pgvector literal (§20); analyzed_at is set only
 * after the row — including its embedding — is written (§19 req 6, §20).
 * Returns "duplicate" if a race already inserted the row (unique article_id, 23505).
 */
async function saveAnalysis(
  admin: SupabaseClient,
  articleId: string,
  output: AnalysisOutput,
  embedding: string,
  model: string
): Promise<"saved" | "duplicate"> {
  const { left, center, right } = normalizeFraming(output);
  const biasScore = (right - left) / 100;

  const { error } = await admin.from("article_analyses").insert({
    article_id: articleId,
    summary: output.summary,
    sentiment_score: output.sentimentScore,
    sentiment_label: output.sentimentLabel,
    bias_score: biasScore,
    bias_label: output.politicalFramingLabel,
    left_percentage: left,
    center_percentage: center,
    right_percentage: right,
    confidence: output.confidence,
    framing_notes: output.framingNotes,
    loaded_terms: output.loadedTerms,
    disclaimer: output.disclaimer,
    model,
    embedding,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") return "duplicate";
    throw new Error(error.message);
  }

  // Set analyzed_at only after the analysis row + embedding are saved (§19/§20).
  const { error: updateError } = await admin
    .from("articles")
    .update({ analyzed_at: new Date().toISOString() })
    .eq("id", articleId);
  if (updateError) throw new Error(updateError.message);

  return "saved";
}

/** Analyze one article with a single retry on invalid/failed output (§19 req 5). */
async function analyzeWithRetry(title: string, body: string): Promise<AnalysisOutput> {
  try {
    return await analyzeArticle(title, body);
  } catch {
    // One retry, then let the error propagate to the caller.
    return await analyzeArticle(title, body);
  }
}

/**
 * Run the AI analysis pipeline. Analyzes all pending articles by default, in
 * batches, until none remain (or until `limit`/`articleIds` scope is met).
 */
export async function runAnalysisPipeline(
  options: AnalyzeOptions = {}
): Promise<AnalysisSummary> {
  const startedAt = Date.now();
  const admin = createSupabaseAdminClient();
  const log = createAnalysisLogger(admin);
  const model = resolveModelName();
  const batchSize = resolveBatchSize(options);

  log.event("info", "analysis_started", "Analysis started", { options, model, batchSize });

  let pendingIds: string[];
  try {
    pendingIds = await getPendingArticleIds(admin, options);
  } catch (err) {
    log.event("error", "analysis_failed", (err as Error).message);
    return log.summary("failed", startedAt);
  }

  log.event("info", "pending_detected", `${pendingIds.length} pending article(s)`, {
    count: pendingIds.length,
  });

  for (let i = 0; i < pendingIds.length; i += batchSize) {
    const batchIds = pendingIds.slice(i, i + batchSize);
    log.counters.batches += 1;
    log.event("info", "batch_started", `Batch ${log.counters.batches} (${batchIds.length})`);

    let articles: PendingArticle[];
    try {
      articles = await loadArticles(admin, batchIds);
    } catch (err) {
      log.counters.failed += batchIds.length;
      log.incrFailure("load_error");
      log.event("error", "batch_load_failed", (err as Error).message);
      continue;
    }

    for (const article of articles) {
      const body = (article.raw_text ?? "").trim();
      if (!body || !article.title?.trim()) {
        log.counters.skipped += 1;
        log.incrFailure("empty_text");
        log.event("info", "article_skipped", "No usable text", { id: article.id });
        continue;
      }

      let output: AnalysisOutput;
      try {
        log.event("info", "article_analyzing", article.title, { id: article.id });
        output = await analyzeWithRetry(article.title, body);
      } catch (err) {
        log.counters.failed += 1;
        log.incrFailure("invalid_output");
        log.event("warn", "article_failed", (err as Error).message, { id: article.id });
        continue;
      }

      // Generate the embedding before saving so analyzed_at is only set once the
      // row has a non-null embedding (§20). If embedding fails, skip saving and
      // let the next run retry the whole article cleanly.
      let embedding: string;
      try {
        embedding = toVectorLiteral(await embedArticle(article.title, body));
      } catch (err) {
        log.counters.failed += 1;
        log.counters.embeddingFailed += 1;
        log.incrFailure("embedding_error");
        log.event("warn", "article_embedding_failed", (err as Error).message, {
          id: article.id,
        });
        continue;
      }

      try {
        const result = await saveAnalysis(admin, article.id, output, embedding, model);
        if (result === "duplicate") {
          log.counters.skipped += 1;
          log.incrFailure("already_analyzed");
          log.event("info", "article_skipped", "Already analyzed", { id: article.id });
        } else {
          log.counters.analyzed += 1;
          log.counters.embedded += 1;
          log.event("info", "article_analyzed", article.title, { id: article.id });
        }
      } catch (err) {
        log.counters.failed += 1;
        log.incrFailure("save_error");
        log.event("warn", "article_save_failed", (err as Error).message, { id: article.id });
      }
    }
  }

  // §20 backfill: embed already-analyzed articles whose embedding is null.
  let backlogIds: string[] = [];
  try {
    backlogIds = await getEmbeddingBacklogIds(admin, options);
  } catch (err) {
    log.event("warn", "embedding_backlog_failed", (err as Error).message);
  }

  if (backlogIds.length > 0) {
    log.event("info", "embedding_backlog_detected", `${backlogIds.length} to backfill`, {
      count: backlogIds.length,
    });
  }

  for (let i = 0; i < backlogIds.length; i += batchSize) {
    const batchIds = backlogIds.slice(i, i + batchSize);
    let articles: PendingArticle[];
    try {
      articles = await loadArticles(admin, batchIds);
    } catch (err) {
      log.counters.embeddingFailed += batchIds.length;
      log.incrFailure("load_error");
      log.event("error", "backfill_load_failed", (err as Error).message);
      continue;
    }

    for (const article of articles) {
      const body = (article.raw_text ?? "").trim();
      if (!body || !article.title?.trim()) {
        log.incrFailure("empty_text");
        log.event("info", "backfill_skipped", "No usable text", { id: article.id });
        continue;
      }

      let embedding: string;
      try {
        embedding = toVectorLiteral(await embedArticle(article.title, body));
      } catch (err) {
        log.counters.embeddingFailed += 1;
        log.incrFailure("embedding_error");
        log.event("warn", "backfill_embedding_failed", (err as Error).message, {
          id: article.id,
        });
        continue;
      }

      try {
        await backfillEmbedding(admin, article, embedding);
        log.counters.embedded += 1;
        log.event("info", "embedding_backfilled", article.title, { id: article.id });
      } catch (err) {
        log.counters.embeddingFailed += 1;
        log.incrFailure("save_error");
        log.event("warn", "backfill_save_failed", (err as Error).message, { id: article.id });
      }
    }
  }

  log.event("info", "analysis_completed", "Analysis completed");
  return log.summary("completed", startedAt);
}
