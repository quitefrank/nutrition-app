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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. " +
    "Data persistence will not work. Add both to your .env.local (dev) or Vercel environment variables (prod)."
  );
}

// Guard: createClient throws if the URL is falsy, which crashes the build
// when env vars are absent. Use placeholder values so the module loads
// cleanly; all DB calls will fail gracefully at runtime without real config.
export const supabase = createClient<Database>(
  supabaseUrl || "https://unconfigured.supabase.co",
  supabaseAnonKey || "unconfigured-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
