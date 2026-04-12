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
 * @returns        Map of Gemini dish ID → Supabase recipe UUID for all saved dishes,
 *                 or null if Supabase is not configured or no dishes were saved.
 */
export async function autoSaveToSupabase(scanKey: string): Promise<Record<string, string> | null> {
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
    const dishToRecipeMap: Record<string, string> = {};

    for (const dish of dishes) {
      const estimatedCalories =
        typeof dish.calorieEstimate === "number" && dish.calorieEstimate > 0
          ? Math.round(dish.calorieEstimate)
          : null;

      // Dedup: if the same dish name already exists at this restaurant (and hasn't been removed),
      // reuse the existing recipe UUID rather than inserting a duplicate row.
      const { data: existingRecipe } = await supabase
        .from("recipes")
        .select("id, dish_image_url")
        .eq("restaurant_id", restaurantId)
        .eq("name", dish.name)
        .neq("status", "removed")
        .limit(1)
        .single();

      if (existingRecipe) {
        if (dish.id) dishToRecipeMap[dish.id] = existingRecipe.id;
        // Backfill the photo if the stored row has none but this scan provides one
        if (!existingRecipe.dish_image_url && dish.photoUrl) {
          await supabase
            .from("recipes")
            .update({ dish_image_url: dish.photoUrl, photo_status: "confirmed" })
            .eq("id", existingRecipe.id);
        }
        continue;
      }

      const { data: recipeData, error: recipeError } = await supabase
        .from("recipes")
        .insert({
          restaurant_id: restaurantId,
          visit_id: visitId,
          name: dish.name,
          description: dish.description ?? null,
          dish_image_url: dish.photoUrl ?? null,
          estimated_calories: estimatedCalories,
          status: "auto_captured",
          gemini_confidence: typeof dish.confidence === "number" ? dish.confidence : null,
          // photo_status: confidence < 0.3 → suppressed (card hidden); otherwise placeholder until enrichment
          photo_status: typeof dish.confidence === "number" && dish.confidence < 0.3
            ? "suppressed"
            : "placeholder",
        })
        .select("id")
        .single();

      if (recipeError || !recipeData) {
        console.warn("[supabaseAutoSave] recipe insert failed for", dish.name, recipeError?.message);
        continue;
      }

      const recipeId = recipeData.id;
      if (dish.id) dishToRecipeMap[dish.id] = recipeId;

      // Insert ingredients (if any exist on this dish)
      const ingredientsToInsert = (dish.ingredients ?? [])
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

      if (ingredientsToInsert.length > 0) {
        const { error: ingError } = await supabase
          .from("recipe_ingredients")
          .insert(ingredientsToInsert);

        if (ingError) {
          console.warn("[supabaseAutoSave] ingredients insert failed:", ingError.message);
          // Non-blocking — recipe is still saved, ingredients are best-effort
        }
      }
    }

    // 5. Notify the recipe page of the real Supabase ID ───────────────────────
    const firstRecipeId = Object.values(dishToRecipeMap)[0] ?? null;
    if (firstRecipeId) {
      window.dispatchEvent(
        new CustomEvent("plately:supabase-saved", {
          detail: { scanKey, recipeId: firstRecipeId },
        })
      );
    }

    return Object.keys(dishToRecipeMap).length > 0 ? dishToRecipeMap : null;
  } catch (err) {
    // Never crash the UX — auto-save is best-effort
    console.warn(
      "[supabaseAutoSave] unexpected error (non-blocking):",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
