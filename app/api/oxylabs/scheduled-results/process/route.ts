import { hasValidAdminSecret } from "@/lib/pipeline/admin-auth";
import { processScheduledResults } from "@/lib/pipeline/scheduler";

// POST /api/oxylabs/scheduled-results/process (AGENTS.md §14, §15, §18).
// On-demand processing of completed scheduled results through the same
// scrape-to-insert pipeline as manual scraping. Admin-secret guarded.
// Node runtime required (Cheerio + Oxylabs + service-role client); never Edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!hasValidAdminSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await processScheduledResults();
    return Response.json(summary, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: "Processing failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
