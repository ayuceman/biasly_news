import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runScrapePipeline } from "@/lib/pipeline/scrape";
import { loadSelectedSources } from "@/lib/pipeline/sources";
import {
  createSchedule,
  fetchJobResultHtml,
  getLatestRunJobs,
  listOxylabsScheduleIds,
  setScheduleState,
} from "@/lib/pipeline/oxylabs-scheduler";
import type { SelectedSource } from "@/lib/pipeline/types";
import type {
  ProcessScheduledSummary,
  SyncSchedulesSummary,
} from "@/lib/pipeline/scheduler-types";

// Oxylabs Scheduler orchestration (AGENTS.md §18). Two independent operations:
//   syncSchedules            — create one Oxylabs schedule per active source
//                              homepage, store it, and deactivate orphans.
//   processScheduledResults  — fetch completed job HTML and run the SAME
//                              scrape-to-insert pipeline as manual scraping,
//                              overriding only where the homepage HTML comes
//                              from. Detail pages are still scraped live (§18).
// This module never duplicates validation/cleanup/dedupe/logging — it reuses
// runScrapePipeline (§18).

// Top of every hour; Vercel Cron fires 15 minutes later to process (§18).
const SCHEDULE_CRON = "0 * * * *";
// Far-future stop timestamp (Oxylabs requires end_time; format YYYY-MM-DD HH:MM:SS).
const SCHEDULE_END_TIME = "2035-12-31 23:59:59";

function log(message: string, context?: Record<string, unknown>): void {
  console.log(`[scheduler] ${message}`, context ?? "");
}

/**
 * Create one Oxylabs schedule per active source that does not already have a
 * live stored schedule, store each with its exact string schedule_id, then
 * deactivate orphaned Oxylabs schedules no longer represented in the DB (§18).
 */
export async function syncSchedules(
  admin: SupabaseClient = createSupabaseAdminClient()
): Promise<SyncSchedulesSummary> {
  const startedAt = Date.now();
  log("sync started");

  let sources: SelectedSource[];
  try {
    sources = await loadSelectedSources(admin, {});
  } catch (err) {
    log("sync failed loading sources", { error: (err as Error).message });
    return {
      status: "failed",
      activeSources: 0,
      created: 0,
      existing: 0,
      deactivated: 0,
      totalDurationMs: Date.now() - startedAt,
    };
  }

  // Source IDs that already have a live stored schedule row.
  const { data: existingRows, error: existingErr } = await admin
    .from("oxylabs_schedules")
    .select("source_id, oxylabs_schedule_id")
    .eq("active", true);
  if (existingErr) {
    log("sync failed loading existing schedules", { error: existingErr.message });
    return {
      status: "failed",
      activeSources: sources.length,
      created: 0,
      existing: 0,
      deactivated: 0,
      totalDurationMs: Date.now() - startedAt,
    };
  }

  const withSchedule = new Set(
    (existingRows ?? [])
      .map((r) => r.source_id as string | null)
      .filter((id): id is string => id !== null)
  );

  let created = 0;
  let existing = 0;

  for (const source of sources) {
    if (withSchedule.has(source.id)) {
      existing += 1;
      continue;
    }
    try {
      const schedule = await createSchedule({
        cron: SCHEDULE_CRON,
        homepageUrl: source.listing_url,
        endTime: SCHEDULE_END_TIME,
      });
      const { error: insertErr } = await admin.from("oxylabs_schedules").insert({
        source_id: source.id,
        oxylabs_schedule_id: schedule.oxylabsScheduleId,
        cron: schedule.cron,
        active: true,
      });
      if (insertErr) throw new Error(insertErr.message);
      created += 1;
      log("schedule created", { source: source.name, oxylabsScheduleId: schedule.oxylabsScheduleId });
    } catch (err) {
      log("schedule creation failed", { source: source.name, error: (err as Error).message });
    }
  }

  // Orphan deactivation (§18): any Oxylabs schedule not present in the DB is
  // deactivated so it stops running hourly and billing.
  let deactivated = 0;
  try {
    const oxylabsIds = await listOxylabsScheduleIds();
    const { data: dbRows, error: dbErr } = await admin
      .from("oxylabs_schedules")
      .select("oxylabs_schedule_id");
    if (dbErr) throw new Error(dbErr.message);
    const dbIds = new Set(
      (dbRows ?? [])
        .map((r) => r.oxylabs_schedule_id as string | null)
        .filter((id): id is string => id !== null)
    );
    for (const id of oxylabsIds) {
      if (dbIds.has(id)) continue;
      try {
        await setScheduleState(id, false);
        deactivated += 1;
        log("orphan schedule deactivated", { oxylabsScheduleId: id });
      } catch (err) {
        log("orphan deactivation failed", { oxylabsScheduleId: id, error: (err as Error).message });
      }
    }
  } catch (err) {
    log("orphan deactivation pass failed", { error: (err as Error).message });
  }

  const summary: SyncSchedulesSummary = {
    status: "completed",
    activeSources: sources.length,
    created,
    existing,
    deactivated,
    totalDurationMs: Date.now() - startedAt,
  };
  log("sync completed", { ...summary });
  return summary;
}

type ScheduleRowWithSource = {
  id: string;
  oxylabs_schedule_id: string | null;
  source_id: string | null;
  source: { id: string; name: string; listing_url: string } | null;
};

/**
 * Process completed scheduled results: for each active stored schedule, read the
 * latest run's jobs, fetch HTML for `result_status === 'done'` jobs, record a run
 * row per job, then run the scrape-to-insert pipeline (§9) over the scheduled
 * homepage HTML. Detail pages are scraped live by the pipeline. Never saves raw
 * homepage results as articles — only the validated pipeline inserts (§18).
 */
export async function processScheduledResults(
  admin: SupabaseClient = createSupabaseAdminClient()
): Promise<ProcessScheduledSummary> {
  const startedAt = Date.now();
  log("processing started");

  const { data, error } = await admin
    .from("oxylabs_schedules")
    .select("id, oxylabs_schedule_id, source_id, source:sources ( id, name, listing_url )")
    .eq("active", true);
  if (error) {
    log("processing failed loading schedules", { error: error.message });
    return {
      status: "failed",
      schedulesChecked: 0,
      doneJobs: 0,
      sourcesWithHtml: 0,
      scrape: null,
      totalDurationMs: Date.now() - startedAt,
    };
  }

  const rows = (data as unknown as ScheduleRowWithSource[] | null) ?? [];

  // Homepage HTML keyed by source id, and the source names to feed the pipeline.
  const htmlBySourceId = new Map<string, string>();
  const sourceNames: string[] = [];
  let doneJobs = 0;

  for (const row of rows) {
    const oxylabsScheduleId = row.oxylabs_schedule_id;
    // The embed may come back as an object or a single-element array.
    const source = Array.isArray(row.source) ? row.source[0] : row.source;
    if (!oxylabsScheduleId || !source) continue;

    let jobs;
    try {
      jobs = await getLatestRunJobs(oxylabsScheduleId);
    } catch (err) {
      log("runs fetch failed", { source: source.name, error: (err as Error).message });
      continue;
    }

    for (const job of jobs) {
      // Record every job's status for visibility (§18 run rows).
      await admin.from("oxylabs_schedule_runs").insert({
        schedule_id: row.id,
        oxylabs_job_id: job.jobId,
        result_status: job.resultStatus,
      });
    }

    // One item per schedule = one homepage; use the first done job's HTML.
    const doneJob = jobs.find((j) => j.resultStatus === "done");
    if (!doneJob) {
      log("no done job for source", { source: source.name });
      continue;
    }

    try {
      const html = await fetchJobResultHtml(doneJob.jobId);
      if (!htmlBySourceId.has(source.id)) {
        htmlBySourceId.set(source.id, html);
        sourceNames.push(source.name);
      }
      doneJobs += 1;
      log("done job HTML fetched", { source: source.name, jobId: doneJob.jobId });
    } catch (err) {
      log("result fetch failed", { source: source.name, jobId: doneJob.jobId, error: (err as Error).message });
    }
  }

  if (sourceNames.length === 0) {
    log("processing completed — no scheduled HTML to process");
    return {
      status: "completed",
      schedulesChecked: rows.length,
      doneJobs,
      sourcesWithHtml: 0,
      scrape: null,
      totalDurationMs: Date.now() - startedAt,
    };
  }

  // Reuse the exact scrape-to-insert pipeline (§18): only the homepage HTML
  // source is overridden; detail scraping stays live (default provider).
  const scrape = await runScrapePipeline({
    options: { sources: sourceNames },
    getHomepageHtml: async (source) => {
      const html = htmlBySourceId.get(source.id);
      if (!html) throw new Error(`No scheduled HTML for source ${source.name}`);
      return html;
    },
  });

  const summary: ProcessScheduledSummary = {
    status: "completed",
    schedulesChecked: rows.length,
    doneJobs,
    sourcesWithHtml: sourceNames.length,
    scrape,
    totalDurationMs: Date.now() - startedAt,
  };
  log("processing completed", {
    schedulesChecked: summary.schedulesChecked,
    doneJobs: summary.doneJobs,
    sourcesWithHtml: summary.sourcesWithHtml,
    articlesInserted: scrape.articlesInserted,
  });
  return summary;
}
