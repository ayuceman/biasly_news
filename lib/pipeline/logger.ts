import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScrapeSummary } from "@/lib/pipeline/types";
import type { AnalysisSummary } from "@/lib/pipeline/analysis-types";

// Run logging (AGENTS.md §9). Neat server-side console messages during a run,
// running counters for the final summary object, and best-effort persistence
// of events + summary to the `logs` table via the service-role client.

type LogLevel = "info" | "warn" | "error";

type Counters = {
  sourcesChecked: number;
  candidatesFound: number;
  candidatesRejected: number;
  duplicatesSkipped: number;
  detailPagesScraped: number;
  articlesInserted: number;
  articlesRejected: number;
  articlesFailed: number;
  rejectionReasons: Record<string, number>;
};

export type RunLogger = {
  event: (
    level: LogLevel,
    event: string,
    message: string,
    context?: Record<string, unknown>
  ) => void;
  counters: Counters;
  incrRejection: (reason: string) => void;
  summary: (status: ScrapeSummary["status"], startedAt: number) => Promise<ScrapeSummary>;
};

/**
 * Create a run logger bound to the service-role client. `logs`-table writes are
 * best-effort — a logging failure never aborts the scrape run.
 */
export function createRunLogger(admin: SupabaseClient): RunLogger {
  const counters: Counters = {
    sourcesChecked: 0,
    candidatesFound: 0,
    candidatesRejected: 0,
    duplicatesSkipped: 0,
    detailPagesScraped: 0,
    articlesInserted: 0,
    articlesRejected: 0,
    articlesFailed: 0,
    rejectionReasons: {},
  };

  // Fire-and-forget persistence so console + counters stay synchronous.
  function persist(
    level: LogLevel,
    event: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    void admin
      .from("logs")
      .insert({ level, event, message, context: context ?? null })
      .then(({ error }) => {
        if (error) {
          console.warn(`[scrape] failed to persist log: ${error.message}`);
        }
      });
  }

  function event(
    level: LogLevel,
    eventName: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const prefix = `[scrape] ${eventName}`;
    if (level === "error") console.error(prefix, message, context ?? "");
    else if (level === "warn") console.warn(prefix, message, context ?? "");
    else console.log(prefix, message, context ?? "");
    persist(level, eventName, message, context);
  }

  function incrRejection(reason: string): void {
    counters.rejectionReasons[reason] = (counters.rejectionReasons[reason] ?? 0) + 1;
  }

  async function summary(
    status: ScrapeSummary["status"],
    startedAt: number
  ): Promise<ScrapeSummary> {
    const result: ScrapeSummary = {
      status,
      sourcesChecked: counters.sourcesChecked,
      candidatesFound: counters.candidatesFound,
      candidatesRejected: counters.candidatesRejected,
      duplicatesSkipped: counters.duplicatesSkipped,
      detailPagesScraped: counters.detailPagesScraped,
      articlesInserted: counters.articlesInserted,
      articlesRejected: counters.articlesRejected,
      articlesFailed: counters.articlesFailed,
      totalDurationMs: Date.now() - startedAt,
      rejectionReasons: counters.rejectionReasons,
    };
    console.log("[scrape] summary", result);
    // Persist the summary synchronously-ish (still best-effort).
    const { error } = await admin
      .from("logs")
      .insert({
        level: status === "completed" ? "info" : "error",
        event: "scrape_summary",
        message: `Scrape ${status}`,
        context: result,
      });
    if (error) console.warn(`[scrape] failed to persist summary: ${error.message}`);
    return result;
  }

  return { event, counters, incrRejection, summary };
}

// ---------------------------------------------------------------------------
// Analysis run logging (AGENTS.md §19). Same console + `logs`-table style as the
// scrape logger, with counters/summary shaped for the analysis pipeline.
// ---------------------------------------------------------------------------

type AnalysisCounters = {
  analyzed: number;
  skipped: number;
  failed: number;
  embedded: number;
  embeddingFailed: number;
  batches: number;
  failureReasons: Record<string, number>;
};

export type AnalysisLogger = {
  event: (
    level: LogLevel,
    event: string,
    message: string,
    context?: Record<string, unknown>
  ) => void;
  counters: AnalysisCounters;
  incrFailure: (reason: string) => void;
  summary: (status: AnalysisSummary["status"], startedAt: number) => Promise<AnalysisSummary>;
};

/**
 * Create an analysis run logger bound to the service-role client. `logs`-table
 * writes are best-effort — a logging failure never aborts the analysis run.
 */
export function createAnalysisLogger(admin: SupabaseClient): AnalysisLogger {
  const counters: AnalysisCounters = {
    analyzed: 0,
    skipped: 0,
    failed: 0,
    embedded: 0,
    embeddingFailed: 0,
    batches: 0,
    failureReasons: {},
  };

  function persist(
    level: LogLevel,
    event: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    void admin
      .from("logs")
      .insert({ level, event, message, context: context ?? null })
      .then(({ error }) => {
        if (error) {
          console.warn(`[analyze] failed to persist log: ${error.message}`);
        }
      });
  }

  function event(
    level: LogLevel,
    eventName: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const prefix = `[analyze] ${eventName}`;
    if (level === "error") console.error(prefix, message, context ?? "");
    else if (level === "warn") console.warn(prefix, message, context ?? "");
    else console.log(prefix, message, context ?? "");
    persist(level, eventName, message, context);
  }

  function incrFailure(reason: string): void {
    counters.failureReasons[reason] = (counters.failureReasons[reason] ?? 0) + 1;
  }

  async function summary(
    status: AnalysisSummary["status"],
    startedAt: number
  ): Promise<AnalysisSummary> {
    const result: AnalysisSummary = {
      status,
      analyzed: counters.analyzed,
      skipped: counters.skipped,
      failed: counters.failed,
      embedded: counters.embedded,
      embeddingFailed: counters.embeddingFailed,
      batches: counters.batches,
      totalDurationMs: Date.now() - startedAt,
      failureReasons: counters.failureReasons,
    };
    console.log("[analyze] summary", result);
    const { error } = await admin.from("logs").insert({
      level: status === "completed" ? "info" : "error",
      event: "analysis_summary",
      message: `Analysis ${status}`,
      context: result,
    });
    if (error) console.warn(`[analyze] failed to persist summary: ${error.message}`);
    return result;
  }

  return { event, counters, incrFailure, summary };
}
