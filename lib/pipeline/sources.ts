import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScrapeOptions, SelectedSource } from "@/lib/pipeline/types";

// Source selection for the pipeline (AGENTS.md §8). Loads ACTIVE sources from
// Supabase via the service-role client (the pipeline runs privileged), then
// applies the optional user selection. Source URLs live only in the DB — never
// hardcoded here (§7).

/**
 * Load active sources selected for a run. When `options.sources` is provided,
 * match by name (case-insensitive) or listing_url; otherwise return all active
 * sources. Throws on DB error; returns [] when nothing matches.
 */
export async function loadSelectedSources(
  admin: SupabaseClient,
  options: ScrapeOptions
): Promise<SelectedSource[]> {
  const { data, error } = await admin
    .from("sources")
    .select("id, name, listing_url, parser_strategy")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active sources: ${error.message}`);
  }

  const all = (data as SelectedSource[] | null) ?? [];

  const requested = options.sources
    ?.map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!requested || requested.length === 0) return all;

  const wanted = new Set(requested);
  return all.filter(
    (source) =>
      wanted.has(source.name.trim().toLowerCase()) ||
      wanted.has(source.listing_url.trim().toLowerCase())
  );
}
