/**
 * Supabase client — Plately v2
 *
 * Required environment variables (add to .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
 *
 * Both values are found in your Supabase project dashboard under:
 *   Settings → API → Project URL and Project API keys (anon / public)
 *
 * NOTE: These are NEXT_PUBLIC_ prefixed — they are safe to expose in
 * the browser. The anon key is restricted by Row Level Security policies
 * defined in supabase/migrations/001_initial_schema.sql.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "[supabase] Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
    "Add both to your .env.local (dev) or Vercel environment variables (prod)."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
