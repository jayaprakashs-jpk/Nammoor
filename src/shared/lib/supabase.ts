import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// One client for web and Android. Created on first use, not at import,
// so pages that don't touch data don't pay for it.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase keys missing. Copy .env.example to .env.local and fill it.");
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
