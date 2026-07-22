import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET /api/logs — recent pipeline run logs for observing runs (AGENTS.md §14).
// The `logs` table has RLS enabled with no public policy, so this read uses the
// server-only service-role client (never reachable from the browser).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(1, requested), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("logs")
    .select("id, level, event, message, context, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return Response.json(
      { error: "Failed to load logs", detail: error.message },
      { status: 500 }
    );
  }

  return Response.json({ count: data?.length ?? 0, logs: data ?? [] }, { status: 200 });
}
