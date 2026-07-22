import { processScheduledResults } from "@/lib/pipeline/scheduler";
import { runAnalysisPipeline } from "@/lib/pipeline/analyze";
import type { CronPipelineSummary } from "@/lib/pipeline/scheduler-types";

// GET /api/cron/pipeline (AGENTS.md §14, §18). Internal-only automatic hourly
// pipeline: (1) process scheduled results, then (2) run AI analysis. Step two
// ALWAYS runs even if step one throws — there may be pre-existing unanalyzed
// articles. Vercel Cron sends GET, so this is the one GET action route.
//
// Protected by CRON_SECRET (Vercel injects it as `Authorization: Bearer <secret>`
// on every cron request). Reject missing/wrong secret with 401 in production.
// In local development the check is skipped so the route is manually testable.
// Never protected by BIASLY_ADMIN_SECRET; CRON_SECRET is never in .env.local (§18).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  // Local dev: skip the secret check so the route can be tested manually (§18).
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // misconfigured production → deny
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  console.log("[cron] pipeline started");

  // Step one: process scheduled results. Capture failure but do not abort —
  // step two must still run (§18).
  let process: CronPipelineSummary["process"];
  try {
    process = await processScheduledResults();
    console.log("[cron] processing step done", { status: process.status });
  } catch (err) {
    process = { status: "failed", error: (err as Error).message };
    console.error("[cron] processing step failed", (err as Error).message);
  }

  // Step two: analyze all pending articles (always runs).
  let analysis: CronPipelineSummary["analysis"];
  try {
    analysis = await runAnalysisPipeline({});
    console.log("[cron] analysis step done", { status: analysis.status });
  } catch (err) {
    analysis = { status: "failed", error: (err as Error).message };
    console.error("[cron] analysis step failed", (err as Error).message);
  }

  const summary: CronPipelineSummary = {
    status:
      process.status === "completed" && analysis.status === "completed"
        ? "completed"
        : "failed",
    process,
    analysis,
    totalDurationMs: Date.now() - startedAt,
  };
  console.log("[cron] pipeline completed", { status: summary.status, durationMs: summary.totalDurationMs });
  return Response.json(summary, { status: 200 });
}
