/**
 * retakeMergeAndSave — merge a retake scan result into an existing restaurant.
 *
 * Deduplicates against existing recipe rows by dish name (case-insensitive,
 * trimmed). Only inserts truly new dishes. Creates a new restaurant_visits row
 * for the retake. Invalidates the TanStack Query cache when done.
 *
 * SEC-INJ-1.00: all values passed to Supabase via parameterised client calls.
 * SEC-SEC-1.00: uses browser anon key — no service role in client code.
 */

import { supabase } from '@/lib/supabase';
import type { QueryClient } from '@tanstack/react-query';
import type { RecipeStatus, PhotoStatus } from '@/types/database';

interface RetakeDish {
  id?: string;
  name: string;
  description?: string;
  calorieEstimate?: number | null;
  confidence?: number;
  ingredients?: Array<{
    name: string;
    quantity?: string | null;
    unit?: string | null;
    confidenceLevel?: 'high' | 'medium' | 'low';
  }>;
}

interface RetakeMergeOptions {
  restaurantId: string;
  newDishes: RetakeDish[];
  /** Already-captured dish names — lowercase, trimmed */
  existingDishNames: string[];
  queryClient: QueryClient;
}

/**
 * @returns Number of newly inserted recipe rows (0 if all dishes were already captured)
 */
export async function retakeMergeAndSave({
  restaurantId,
  newDishes,
  existingDishNames,
  queryClient,
}: RetakeMergeOptions): Promise<number> {
  // Step 1: In-memory dedup — P11: normalise internally even if caller already normalised
  const existingSet = new Set(existingDishNames.map((n) => n.toLowerCase().trim()));
  const dishesToInsert = newDishes.filter(
    (d) => d.name.trim().length > 0 && !existingSet.has(d.name.toLowerCase().trim())
  );

  // Step 2: Create a new visit record for this retake (best-effort)
  // P12: raw_menu_json captures the FULL scan (newDishes), not just the deduped subset
  const { data: visitData, error: visitError } = await supabase
    .from('restaurant_visits')
    .insert({
      restaurant_id: restaurantId,
      visit_type: 'scan',
      raw_menu_json: JSON.stringify(
        newDishes.map((d) => ({ name: d.name, description: d.description ?? '' }))
      ),
    })
    .select('id')
    .single();

  // P7: log visit insert errors — visit is best-effort so we continue regardless
  if (visitError) {
    console.warn('[retakeMergeAndSave] visit insert failed:', visitError.message);
  }

  const visitId = visitData?.id ?? null;

  // Step 3: Early-exit if in-memory dedup removed everything
  if (dishesToInsert.length === 0) {
    await queryClient.invalidateQueries({
      queryKey: ['recipes', 'restaurant', restaurantId],
    });
    return 0;
  }

  // D1: ONE bulk SELECT to find which candidate dishes already exist in the DB
  const { data: existingDbRows, error: fetchError } = await supabase
    .from('recipes')
    .select('name')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'removed');

  if (fetchError) {
    console.warn('[retakeMergeAndSave] bulk fetch failed:', fetchError.message);
  }

  const dbNamesSet = new Set(
    (existingDbRows ?? []).map((r: { name: string }) => r.name.toLowerCase().trim())
  );
  const trulyNewDishes = dishesToInsert.filter(
    (d) => !dbNamesSet.has(d.name.toLowerCase().trim())
  );

  if (trulyNewDishes.length === 0) {
    await queryClient.invalidateQueries({
      queryKey: ['recipes', 'restaurant', restaurantId],
    });
    return 0;
  }

  // D1: ONE bulk INSERT for all new recipes
  const recipesToInsert = trulyNewDishes.map((d) => ({
    restaurant_id: restaurantId,
    visit_id: visitId,
    name: d.name.trim(),
    description: d.description ?? null,
    estimated_calories:
      typeof d.calorieEstimate === 'number' && d.calorieEstimate > 0
        ? Math.round(d.calorieEstimate)
        : null,
    status: 'auto_captured' as RecipeStatus,
    gemini_confidence: typeof d.confidence === 'number' ? d.confidence : null,
    photo_status: (typeof d.confidence === 'number' && d.confidence < 0.3
        ? 'suppressed'
        : 'placeholder') as PhotoStatus,
  }));

  const { data: insertedRecipes, error: bulkInsertError } = await supabase
    .from('recipes')
    .insert(recipesToInsert)
    .select('id, name');

  if (bulkInsertError) {
    console.warn('[retakeMergeAndSave] bulk recipe insert failed:', bulkInsertError.message);
  }

  const insertedList = insertedRecipes ?? [];

  // D1: Insert ingredients in parallel (best-effort — non-blocking)
  await Promise.allSettled(
    insertedList.map((recipe: { id: string; name: string }) => {
      const dish = trulyNewDishes.find(
        (d) => d.name.trim().toLowerCase() === recipe.name.toLowerCase()
      );
      if (!dish) return Promise.resolve();

      const ingredientsToInsert = (dish.ingredients ?? [])
        .filter((ing) => ing.name?.trim())
        .map((ing) => ({
          recipe_id: recipe.id,
          name: ing.name.trim(),
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          confidence: (ing.confidenceLevel ?? 'medium') as 'high' | 'medium' | 'low',
        }));

      if (ingredientsToInsert.length === 0) return Promise.resolve();

      return supabase.from('recipe_ingredients').insert(ingredientsToInsert);
    })
  );

  // Step 4: Invalidate TanStack Query cache so RestaurantScreen re-renders
  await queryClient.invalidateQueries({
    queryKey: ['recipes', 'restaurant', restaurantId],
  });

  return insertedList.length;
}
