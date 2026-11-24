import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/types/database";

export type DB = Database["public"];
export type Tables<T extends keyof DB["Tables"]> = DB["Tables"][T]["Row"];
export type Enums<T extends keyof DB["Enums"]> = DB["Enums"][T];

// One client for web and Android. Created on first use, not at import,
// so pages that don't touch data don't pay for it.
let client: SupabaseClient<Database> | null = null;

export function sb(): SupabaseClient<Database> {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase keys missing. Check .env");
  }
  client = createClient<Database>(url, key, {
    // PKCE: the safe way to sign in with Google from a browser or an app.
    // detectSessionInUrl is off: our own callback screen reads the return link.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
  });
  return client;
}
