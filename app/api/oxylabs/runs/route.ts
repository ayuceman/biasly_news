import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET /api/oxylabs/runs — stored scheduled-run rows (AGENTS.md §14, §18).
// Read-only status route. Node runtime (service-role read); never Edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("oxylabs_schedule_runs")
      .select("id, schedule_id, oxylabs_job_id, result_status, ran_at")
      .order("ran_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return Response.json({ count: data?.length ?? 0, runs: data ?? [] }, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: "Failed to load runs", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
