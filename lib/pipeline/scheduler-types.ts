import "server-only";

import type { ScrapeSummary } from "@/lib/pipeline/types";
import type { AnalysisSummary } from "@/lib/pipeline/analysis-types";

// Shared types for the Oxylabs Scheduler orchestration (AGENTS.md §18). Kept
// separate so the routes, orchestrator, and client agree on shapes.

/** Result of syncing Oxylabs schedules to the active source set (§18). */
export type SyncSchedulesSummary = {
  status: "completed" | "failed";
  /** Active sources considered this run. */
  activeSources: number;
  /** New Oxylabs schedules created + stored this run. */
  created: number;
  /** Sources that already had a live stored schedule (skipped). */
  existing: number;
  /** Orphaned Oxylabs schedules deactivated (present on Oxylabs, absent in DB). */
  deactivated: number;
  totalDurationMs: number;
};

/** Result of processing completed scheduled results (§18). Wraps the pipeline
 * summary with scheduler-specific counters. */
export type ProcessScheduledSummary = {
  status: "completed" | "failed";
  /** Stored active schedules inspected this run. */
  schedulesChecked: number;
  /** Jobs with result_status === 'done' whose HTML was fetched. */
  doneJobs: number;
  /** Sources that produced fresh homepage HTML fed into the pipeline. */
  sourcesWithHtml: number;
  /** The underlying scrape-to-insert pipeline summary (null if it never ran). */
  scrape: ScrapeSummary | null;
  totalDurationMs: number;
};

/** Result of the automatic cron pipeline: process → analyze (§18). */
export type CronPipelineSummary = {
  status: "completed" | "failed";
  process: ProcessScheduledSummary | { status: "failed"; error: string };
  analysis: AnalysisSummary | { status: "failed"; error: string };
  totalDurationMs: number;
};
