import { createPostHogClient } from "@/lib/posthog-server";
import { hasValidAdminSecret } from "@/lib/pipeline/admin-auth";
import { runAnalysisPipeline } from "@/lib/pipeline/analyze";
import type { AnalyzeOptions } from "@/lib/pipeline/analysis-types";

// POST /api/analyze — AI article analysis pipeline (AGENTS.md §14, §15, §19).
// Thin handler: auth + parse body + delegate to the pipeline + return summary.
// Node runtime required (AI SDK + service-role client); never Edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseOptions(body: unknown): AnalyzeOptions {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const options: AnalyzeOptions = {};
  if (typeof record.limit === "number" && Number.isFinite(record.limit)) {
    options.limit = record.limit;
  }
  if (typeof record.batchSize === "number" && Number.isFinite(record.batchSize)) {
    options.batchSize = record.batchSize;
  }
  if (Array.isArray(record.articleIds)) {
    options.articleIds = record.articleIds.filter((id): id is string => typeof id === "string");
  }
  return options;
}

export async function POST(request: Request): Promise<Response> {
  if (!hasValidAdminSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const options = parseOptions(body);

  const posthog = createPostHogClient();

  try {
    const summary = await runAnalysisPipeline(options);
    posthog.capture({
      distinctId: "admin_pipeline",
      event: "analysis_pipeline_completed",
      properties: { ...summary },
    });
    await posthog.shutdown();
    return Response.json(summary, { status: 200 });
  } catch (err) {
    posthog.capture({
      distinctId: "admin_pipeline",
      event: "analysis_pipeline_completed",
      properties: { status: "failed" },
    });
    posthog.captureException(err, "admin_pipeline");
    await posthog.shutdown();
    return Response.json(
      { error: "Analysis failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
