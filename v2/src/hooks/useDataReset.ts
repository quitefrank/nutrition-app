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
    onSuccess: async () => {
      // 1. Clear TanStack Query in-memory cache
      queryClient.clear();

      // 2. Wipe all localStorage (covers query-cache, grocery list, recent searches,
      //    banner dismissals, tip flags, scan keys, view preferences, API key, etc.)
      try { localStorage.clear(); } catch { /* ignore — private browsing */ }

      // 3. Wipe sessionStorage (any plately_* scan session data)
      try { sessionStorage.clear(); } catch { /* ignore */ }

      // 4. Delete all service-worker caches (shell + API caches)
      if (typeof caches !== "undefined") {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch { /* ignore */ }
      }

      // 5. Delete the SW IndexedDB (offline grocery sync queue: plately-sw-db)
      try { indexedDB.deleteDatabase("plately-sw-db"); } catch { /* ignore */ }
    },
  });
}
