import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Source } from "@/lib/supabase/types";

/**
 * Active sources (homepages) for scraping/scheduler selection (AGENTS.md §8).
 * Public-read via RLS; safe to call from server components.
 */
export async function getActiveSources(): Promise<Source[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active sources: ${error.message}`);
  }

  return (data as Source[] | null) ?? [];
}
