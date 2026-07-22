import { createPostHogClient } from "@/lib/posthog-server";
import { hasValidAdminSecret } from "@/lib/pipeline/admin-auth";
import { runScrapePipeline } from "@/lib/pipeline/scrape";
import type { ScrapeOptions } from "@/lib/pipeline/types";

// POST /api/scrape — manual scrape-to-insert pipeline (AGENTS.md §14, §15, §16).
// Thin handler: auth + parse body + delegate to the pipeline + return summary.
// Node runtime required (Cheerio + service-role client); never Edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseOptions(body: unknown): ScrapeOptions {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const options: ScrapeOptions = {};
  if (Array.isArray(record.sources)) {
    options.sources = record.sources.filter((s): s is string => typeof s === "string");
  }
  if (typeof record.perSource === "number" && Number.isFinite(record.perSource)) {
    options.perSource = record.perSource;
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
    const summary = await runScrapePipeline({ options });
    posthog.capture({
      distinctId: "admin_pipeline",
      event: "scrape_pipeline_completed",
      properties: { ...summary },
    });
    await posthog.shutdown();
    return Response.json(summary, { status: 200 });
  } catch (err) {
    posthog.capture({
      distinctId: "admin_pipeline",
      event: "scrape_pipeline_completed",
      properties: { status: "failed" },
    });
    posthog.captureException(err, "admin_pipeline");
    await posthog.shutdown();
    return Response.json(
      { error: "Scrape failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
