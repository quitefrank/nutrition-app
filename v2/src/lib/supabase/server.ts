import 'server-only'

/**
 * Supabase server client — Plately v2
 *
 * Server-only client for use in API route handlers.
 * Uses the same anon key as the browser client; row-level security
 * enforces access control at the database layer.
 *
 * SEC-ACC-1.00: Deny by default via RLS. Server routes pass the anon key;
 * all access is gated by Supabase row-level security policies.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Create a fresh Supabase client for use within a single request handler.
 * Call this at the top of each route handler — do not share instances across requests.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '[supabase/server] Missing required environment variables: ' +
        'NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
