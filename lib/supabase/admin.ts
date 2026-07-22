import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS — used ONLY for pipeline writes and
// privileged reads (scraping, analysis, scheduler; later prompts). The
// `server-only` import above makes importing this from client code a build
// error. Never expose SUPABASE_SERVICE_ROLE_KEY to the browser (AGENTS.md §21).

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
