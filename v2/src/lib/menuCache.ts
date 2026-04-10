/**
 * menuCache — server-side restaurant menu caching via Supabase.
 *
 * Chain restaurants often have identical menus across visits. This module
 * caches the dishes JSON from a previous scan in `restaurant_visits.raw_menu_json`
 * so subsequent scans skip Gemini entirely and return instantly.
 *
 * Cache TTL: 30 days. Stale entries are silently ignored (fall through to Gemini).
 *
 * SEC-INJ-1.00: all Supabase queries use parameterised client calls — no string
 *               concatenation in queries.
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CachedDish {
  name: string;
  description?: string;
  calorieEstimate?: number | null;
}

export interface CachedMenuResult {
  dishes: CachedDish[];
  restaurantId: string;
  cachedAt: string;
}

// ─── Supabase client (server-side, using anon key) ────────────────────────────
// The server routes already run in a trusted environment. If a service-role key
// is needed for storage, it lives in the upload route — menu cache only reads/
// writes text columns that the anon key can access under RLS.

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  return createClient<Database>(url, key);
}

// 30-day TTL in milliseconds
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── getCachedMenu ────────────────────────────────────────────────────────────

/**
 * Look up a restaurant's cached menu by placeId or name.
 *
 * Returns the most recent visit that has a non-null raw_menu_json and is
 * within the 30-day TTL. Returns null on cache miss, stale cache, or any
 * Supabase error.
 */
export async function getCachedMenu(
  restaurantIdentifier: { placeId?: string; name?: string }
): Promise<CachedMenuResult | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { placeId, name } = restaurantIdentifier;
  if (!placeId && !name) return null;

  try {
    // Resolve the restaurant row
    let restaurantId: string | null = null;

    if (placeId) {
      const { data } = await supabase
        .from("restaurants")
        .select("id")
        .eq("place_id", placeId)
        .limit(1)
        .single();
      restaurantId = data?.id ?? null;
    }

    if (!restaurantId && name) {
      const { data } = await supabase
        .from("restaurants")
        .select("id")
        .eq("name", name)
        .limit(1)
        .single();
      restaurantId = data?.id ?? null;
    }

    if (!restaurantId) return null;

    // Fetch the most recent visit with a populated menu for this restaurant
    const { data: visit } = await supabase
      .from("restaurant_visits")
      .select("id, raw_menu_json, visited_at")
      .eq("restaurant_id", restaurantId)
      .not("raw_menu_json", "is", null)
      .order("visited_at", { ascending: false })
      .limit(1)
      .single();

    if (!visit?.raw_menu_json || !visit.visited_at) return null;

    // TTL check
    const cachedAt = new Date(visit.visited_at).getTime();
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;

    // Parse the cached dishes JSON
    let dishes: CachedDish[];
    try {
      const parsed = JSON.parse(visit.raw_menu_json) as unknown;
      if (!Array.isArray(parsed)) return null;
      dishes = parsed
        .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
        .map((d) => ({
          name: typeof d.name === "string" ? d.name : "",
          description: typeof d.description === "string" ? d.description : undefined,
          calorieEstimate:
            typeof d.calorieEstimate === "number" && d.calorieEstimate > 0
              ? d.calorieEstimate
              : null,
        }))
        .filter((d) => d.name.trim().length > 0);
    } catch {
      return null;
    }

    if (dishes.length === 0) return null;

    return { dishes, restaurantId, cachedAt: visit.visited_at };
  } catch (err) {
    // Cache miss is non-fatal — caller falls back to Gemini
    console.warn("[menuCache] getCachedMenu error (non-blocking):", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── cacheMenu ────────────────────────────────────────────────────────────────

/**
 * Store a scanned menu's dishes in the most recent visit row for this restaurant.
 *
 * Called fire-and-forget after a successful Gemini scan.
 */
export async function cacheMenu(restaurantId: string, dishesJson: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;

  try {
    // Find the most recent visit for this restaurant (just created in auto-save or
    // created by Gemini in the scan route)
    const { data: visit } = await supabase
      .from("restaurant_visits")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .order("visited_at", { ascending: false })
      .limit(1)
      .single();

    if (visit?.id) {
      await supabase
        .from("restaurant_visits")
        .update({ raw_menu_json: dishesJson })
        .eq("id", visit.id);
    } else {
      // No visit row yet (race condition) — insert one
      await supabase.from("restaurant_visits").insert({
        restaurant_id: restaurantId,
        visit_type: "scan",
        raw_menu_json: dishesJson,
      });
    }
  } catch (err) {
    console.warn("[menuCache] cacheMenu error (non-blocking):", err instanceof Error ? err.message : err);
  }
}
