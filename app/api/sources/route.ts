import { getActiveSources } from "@/lib/supabase/queries/sources";

// GET /api/sources — active sources for selection/testing (AGENTS.md §8, §14).
// Read-only status route: no admin secret, public-read data via the anon
// client (RLS allows SELECT on sources).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const sources = await getActiveSources();
    return Response.json(
      {
        count: sources.length,
        sources: sources.map((s) => ({
          id: s.id,
          name: s.name,
          listing_url: s.listing_url,
          active: s.active,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    return Response.json(
      { error: "Failed to load sources", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
