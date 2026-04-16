/**
 * supabaseAutoSave — client-side fire-and-forget persistence after a scan.
 *
 * Called from CameraModal immediately after writing the initial scan result
 * to sessionStorage. Runs entirely out-of-band so it never blocks the UX.
 *
 * Flow:
 *   1. Read the ScanResult from sessionStorage[scanKey]
 *   2. Upsert the restaurant (by placeId when available, else by name)
 *   3. Create a visit record (type: 'scan')
 *   4. For each dish: insert a recipe row + ingredient rows
 *   5. Dispatch 'plately:supabase-saved' so the recipe page can pick up the real UUID
 *
 * SEC-INJ-1.00: all values passed to Supabase via parameterised client calls.
 * SEC-SEC-1.00: uses browser anon key (NEXT_PUBLIC_) — no service role in client code.
 */

import { supabase } from "@/lib/supabase";
import type { ScanResult } from "@/components/scan/InferenceState";

// ─── Dish shape coming out of sessionStorage ──────────────────────────────────

interface StoredDish {
  id?: string;
  name: string;
  description?: string;
  photoUrl?: string | null;
  calorieEstimate?: number | null;
  confidence?: number;
  ingredients?: Array<{
    name: string;
    quantity?: string | null;
    unit?: string | null;
    confidenceLevel?: "high" | "medium" | "low";
    calories_kcal?: number | null;
    protein_g?: number | null;
    fat_g?: number | null;
    carbs_g?: number | null;
  }>;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Persist a completed scan to Supabase.
 *
 * @param scanKey  sessionStorage key holding the ScanResult JSON
 * @returns        Saved dish map and restaurantId, or null if nothing was saved.
 */
export interface AutoSaveResult {
  dishToRecipeMap: Record<string, string>;
  restaurantId: string;
}

export async function autoSaveToSupabase(scanKey: string): Promise<AutoSaveResult | null> {
  // Guard against silent network hangs: Supabase fetch calls have no built-in
  // client-side timeout. If any query stalls (connection established but no
  // response), the function would never resolve, locking the confirmation UI.
  // 15s covers the worst-case path (restaurant upsert + visit insert +
  // batch recipe insert + batch ingredient insert) on a slow connection.
  const TIMEOUT_MS = 15_000;
  let tid: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    tid = setTimeout(() => {
      console.warn("[supabaseAutoSave] timed out after 15s — unblocking UI");
      resolve(null);
    }, TIMEOUT_MS);
  });
  return Promise.race([
    _doAutoSave(scanKey).finally(() => clearTimeout(tid)),
    timeout,
  ]);
}

async function _doAutoSave(scanKey: string): Promise<AutoSaveResult | null> {
  // 1. Load scan result from sessionStorage
  type ExtendedScanResult = ScanResult & {
    allDishes: StoredDish[];
    restaurantPlaceId?: string | null;
    restaurantAddress?: string | null;
    restaurantRating?: number | null;
    restaurantUserRatingsTotal?: number | null;
  };
  let scanResult: ExtendedScanResult;
  try {
    const raw = sessionStorage.getItem(scanKey);
    if (!raw) return null;
    scanResult = JSON.parse(raw) as ExtendedScanResult;
  } catch {
    console.warn("[supabaseAutoSave] failed to parse sessionStorage entry:", scanKey);
    return null;
  }

  const dishes = scanResult.allDishes ?? [];
  if (dishes.length === 0) return null;

  const restaurantName = scanResult.restaurantName ?? "Unknown Restaurant";
  const restaurantPlaceId = scanResult.restaurantPlaceId ?? null;
  const restaurantRating = scanResult.restaurantRating ?? null;
  const restaurantUserRatingsTotal = scanResult.restaurantUserRatingsTotal ?? null;

  try {
    // 2. Upsert restaurant ─────────────────────────────────────────────────────
    //    Prefer lookup by placeId when available — this ensures the restaurant
    //    row is correctly linked for subsequent useRecipesByRestaurant queries.
    let restaurantId: string;

    if (restaurantPlaceId) {
      // Try lookup by place_id first (most precise)
      const { data: byPlaceId } = await supabase
        .from("restaurants")
        .select("id")
        .eq("place_id", restaurantPlaceId)
        .limit(1)
        .single();

      if (byPlaceId) {
        restaurantId = byPlaceId.id;
      } else {
        // Not found by placeId — insert with both name and place_id (+ rating when available)
        const { data: inserted, error: insertErr } = await supabase
          .from("restaurants")
          .insert({
            name: restaurantName,
            place_id: restaurantPlaceId,
            ...(restaurantRating !== null ? { rating: restaurantRating } : {}),
            ...(restaurantUserRatingsTotal !== null ? { user_ratings_total: restaurantUserRatingsTotal } : {}),
          })
          .select("id")
          .single();

        if (insertErr || !inserted) {
          console.warn("[supabaseAutoSave] restaurant insert failed:", insertErr?.message ?? "no data returned", "— falling back to name lookup");
          // Conflict on name — fall back to name lookup
          const { data: existing } = await supabase
            .from("restaurants")
            .select("id")
            .eq("name", restaurantName)
            .limit(1)
            .single();

          if (!existing) {
            console.warn("[supabaseAutoSave] could not find or create restaurant for placeId:", restaurantPlaceId);
            return null;
          }
          restaurantId = existing.id;
        } else {
          restaurantId = inserted.id;
        }
      }
    } else {
      // No placeId — name-based insert with fallback to lookup
      const { data: restaurantData, error: restaurantError } = await supabase
        .from("restaurants")
        .insert({
          name: restaurantName,
          ...(restaurantRating !== null ? { rating: restaurantRating } : {}),
          ...(restaurantUserRatingsTotal !== null ? { user_ratings_total: restaurantUserRatingsTotal } : {}),
        })
        .select("id")
        .single();

      if (restaurantError) {
        const { data: existing, error: fetchError } = await supabase
          .from("restaurants")
          .select("id")
          .eq("name", restaurantName)
          .limit(1)
          .single();

        if (fetchError || !existing) {
          console.warn("[supabaseAutoSave] could not upsert/fetch restaurant:", restaurantError.message);
          return null;
        }
        restaurantId = existing.id;
      } else {
        restaurantId = restaurantData.id;
      }
    }

    // 3. Create visit record ───────────────────────────────────────────────────
    const { data: visitData } = await supabase
      .from("restaurant_visits")
      .insert({
        restaurant_id: restaurantId,
        visit_type: "scan",
        raw_menu_json: JSON.stringify(dishes.map((d) => ({ name: d.name, description: d.description ?? "" }))),
      })
      .select("id")
      .single();

    const visitId = visitData?.id ?? null;

    // 4. Insert recipe + ingredients for every dish ───────────────────────────
    // Batched: one SELECT for dedup + one INSERT for all new recipes + one INSERT
    // for all ingredients. Replaces the previous per-dish serial loop (3N calls).
    const dishToRecipeMap: Record<string, string> = {};

    // Step A: one-shot dedup — fetch all existing recipes at this restaurant by name
    const { data: existingRecipes } = await supabase
      .from("recipes")
      .select("id, name, dish_image_url")
      .eq("restaurant_id", restaurantId)
      .in("name", dishes.map((d) => d.name))
      .neq("status", "removed");
    const existingByName = new Map(existingRecipes?.map((r) => [r.name, r]) ?? []);

    // Step B: photo backfills for existing recipes that lack a photo — run in parallel
    const photoBackfills = dishes
      .filter((d) => {
        const ex = existingByName.get(d.name);
        return ex && !ex.dish_image_url && d.photoUrl;
      })
      .map((d) =>
        supabase
          .from("recipes")
          .update({ dish_image_url: d.photoUrl as string, photo_status: "confirmed" })
          .eq("id", existingByName.get(d.name)!.id)
      );
    await Promise.allSettled(photoBackfills);

    // Step C: populate dishToRecipeMap from already-existing recipes
    // Gemini dishes rarely carry an id — fall back to name so the map is
    // always populated and useEnrichment can write photos/macros to Supabase.
    for (const [name, existing] of existingByName) {
      const dish = dishes.find((d) => d.name === name);
      if (dish) {
        const key = dish.id ?? dish.name;
        if (key) dishToRecipeMap[key] = existing.id;
      }
    }

    // Step D: batch insert all new (non-duplicate) recipes in one call
    const newDishes = dishes.filter((d) => !existingByName.has(d.name));
    let insertedRecipes: Array<{ id: string; name: string }> = [];
    if (newDishes.length > 0) {
      const { data: recipeRows, error: recipeInsertErr } = await supabase
        .from("recipes")
        .insert(
          newDishes.map((d) => {
            const estimatedCalories =
              typeof d.calorieEstimate === "number" && d.calorieEstimate > 0
                ? Math.round(d.calorieEstimate)
                : null;
            return {
              restaurant_id: restaurantId,
              visit_id: visitId,
              name: d.name,
              description: d.description ?? null,
              dish_image_url: (d.photoUrl ?? null) as string | null,
              estimated_calories: estimatedCalories,
              status: "auto_captured" as const,
              gemini_confidence: typeof d.confidence === "number" ? d.confidence : null,
              // photo_status: confidence < 0.3 → suppressed; has URL → confirmed; else placeholder
              photo_status: (
                typeof d.confidence === "number" && d.confidence < 0.3
                  ? "suppressed"
                  : d.photoUrl
                    ? "confirmed"
                    : "placeholder"
              ) as "suppressed" | "confirmed" | "placeholder",
            };
          })
        )
        .select("id, name");
      if (recipeInsertErr) {
        console.warn("[supabaseAutoSave] batch recipe insert failed:", recipeInsertErr.message);
      }
      insertedRecipes = recipeRows ?? [];
    }

    // Populate dishToRecipeMap for newly inserted recipes
    for (const inserted of insertedRecipes) {
      const dish = newDishes.find((d) => d.name === inserted.name);
      if (dish) {
        const key = dish.id ?? dish.name;
        if (key) dishToRecipeMap[key] = inserted.id;
      }
    }

    // Step E: batch insert all ingredients for new recipes in one call
    const allIngredients = insertedRecipes.flatMap(({ id: recipeId, name }) => {
      const dish = newDishes.find((d) => d.name === name);
      const ings = (dish?.ingredients ?? []) as NonNullable<StoredDish["ingredients"]>;
      return ings
        .filter((ing) => ing.name?.trim())
        .map((ing) => ({
          recipe_id: recipeId,
          name: ing.name.trim(),
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          confidence: (ing.confidenceLevel ?? "medium") as "high" | "medium" | "low",
          calories_per_serving: ing.calories_kcal ?? null,
          protein_g: ing.protein_g ?? null,
          fat_g: ing.fat_g ?? null,
          carbs_g: ing.carbs_g ?? null,
        }));
    });
    if (allIngredients.length > 0) {
      const { error: ingError } = await supabase
        .from("recipe_ingredients")
        .insert(allIngredients);
      if (ingError) {
        console.warn("[supabaseAutoSave] batch ingredients insert failed:", ingError.message);
        // Non-blocking — recipes are still saved, ingredients are best-effort
      }
    }

    // 5. Notify the recipe page of the real Supabase ID ───────────────────────
    const firstRecipeId = Object.values(dishToRecipeMap)[0] ?? null;
    if (firstRecipeId) {
      window.dispatchEvent(
        new CustomEvent("plately:supabase-saved", {
          detail: { scanKey, recipeId: firstRecipeId, restaurantId },
        })
      );
    }

    return Object.keys(dishToRecipeMap).length > 0
      ? { dishToRecipeMap, restaurantId }
      : null;
  } catch (err) {
    // Never crash the UX — auto-save is best-effort
    console.warn(
      "[supabaseAutoSave] unexpected error (non-blocking):",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
