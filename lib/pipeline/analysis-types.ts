import "server-only";

// Shared types for the AI analysis pipeline (AGENTS.md §19). Kept separate from
// the scrape types so the route, orchestrator, and logger agree on shapes.

/** Options accepted by POST /api/analyze and the analysis runner (§19). */
export type AnalyzeOptions = {
  /** Cap the total number of articles analyzed this run. */
  limit?: number;
  /** Restrict to these article IDs (still only ones that are pending). */
  articleIds?: string[];
  /** Override ANALYSIS_BATCH_SIZE for this run. */
  batchSize?: number;
};

/** Final run summary returned by the API and logged (§19, §20 required behavior). */
export type AnalysisSummary = {
  status: "completed" | "failed";
  analyzed: number;
  skipped: number;
  failed: number;
  /** Embeddings saved this run — inline with a new analysis or via backfill (§20). */
  embedded: number;
  /** Embeddings that failed to generate/save this run (§20). */
  embeddingFailed: number;
  /** Categories filled for previously-analyzed rows this run (category backfill). */
  categoriesBackfilled: number;
  batches: number;
  totalDurationMs: number;
  /** Failure/skip reasons grouped by count. */
  failureReasons: Record<string, number>;
};
