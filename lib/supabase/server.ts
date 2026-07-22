import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Anon (publishable-key) client for public reads. Relies on public-read RLS
// policies defined in supabase/schema.sql. Safe to use in server components.
// Never grants write access to protected tables.

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createSupabaseServerClient(): SupabaseClient {
  return createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
