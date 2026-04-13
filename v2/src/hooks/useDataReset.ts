"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Deletes ALL user data from the database.
 * Clears: grocery_items, recipe_ingredients, recipes, restaurant_visits, restaurants
 * in FK dependency order — children first, parents last.
 *
 * SEC-INJ-1.00: No user-supplied values are interpolated into the delete filter.
 * The `.not("id", "is", null)` clause selects every row with a non-null PK,
 * which covers all real rows while satisfying supabase-js v2's required filter.
 */
export function useDataReset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Delete in FK dependency order (children before parents)
      const tables = [
        "grocery_items",
        "recipe_ingredients",
        "recipes",
        "restaurant_visits",
        "restaurants",
      ] as const;

      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .not("id", "is", null);

        if (error) {
          throw new Error(`Failed to delete from ${table}: ${error.message}`);
        }
      }
    },
    onSuccess: () => {
      // Clear the in-memory query cache and the persisted localStorage snapshot
      // so the next launch does not restore stale data after a settings reset.
      queryClient.clear();
      localStorage.removeItem("plately-query-cache");
    },
  });
}
