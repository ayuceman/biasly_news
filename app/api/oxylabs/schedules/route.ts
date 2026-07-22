import { hasValidAdminSecret } from "@/lib/pipeline/admin-auth";
import { syncSchedules } from "@/lib/pipeline/scheduler";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// /api/oxylabs/schedules (AGENTS.md §14, §15, §18).
//   POST — sync Oxylabs schedules to the active source set (admin-secret guarded).
//   GET  — list stored schedule rows (read-only status route).
// Node runtime required (service-role client + Oxylabs calls); never Edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!hasValidAdminSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await syncSchedules();
    return Response.json(summary, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: "Schedule sync failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<Response> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("oxylabs_schedules")
      .select("id, source_id, oxylabs_schedule_id, cron, active, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return Response.json({ count: data?.length ?? 0, schedules: data ?? [] }, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: "Failed to load schedules", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
