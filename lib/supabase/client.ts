import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser anon client (publishable key). Included for completeness; the UI in
// this codebase reads through server components via createSupabaseServerClient.
// Only NEXT_PUBLIC_* values are used here — never the service-role key.

export function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient(url, anonKey);
}
