'use client'

/**
 * useEnrichment — progressive Phase-2 enrichment hook.
 *
 * After Phase 1 (Gemini scan + supabaseAutoSave), call `enrich()` with the
 * session key and dish-to-recipe map. The hook runs entirely fire-and-forget
 * and never blocks the UI.
 *
 * Flow:
 *   1. Read dishes from sessionStorage[scanKey]
 *   2. POST /api/scan/enrich → Gemini infers ingredients; USDA enriches macros
 *   3. Merge enriched dish data back into sessionStorage (enriched: true)
 *   4. Write dish_image_url back to Supabase for any dish that received a photo
 *   5. Invalidate recipe caches so the UI reflects the persisted photos
 *   6. Dispatch 'plately:enriched' so recipe detail pages stop polling
 *
 * Error handling: all failures are caught and swallowed — enrichment is
 * best-effort and must never crash or block the calling component.
 */

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Shape of a dish as returned by /api/scan/enrich
interface EnrichedDish {
  id?: string
  name: string
  servings: number
  ingredients: unknown[]
  photoUrl: string | null
  totalCalories: number | null
  totalProtein: number | null
  totalFat: number | null
  totalCarbs: number | null
}

export function useEnrichment() {
  const queryClient = useQueryClient()
  const [isEnriching, setIsEnriching] = useState(false)

  /**
   * Trigger enrichment for a completed scan.
   *
   * @param scanKey         sessionStorage key holding the raw ScanResult JSON
   * @param dishToRecipeMap Gemini dish ID → Supabase recipe UUID (from autoSave);
   *                        pass null when the auto-save hasn't run or failed
   */
  const enrich = useCallback(
    (
      scanKey: string,
      dishToRecipeMap: Record<string, string> | null
    ) => {
      setIsEnriching(true)

      void (async () => {
        try {
          // 1. Read scan data from sessionStorage
          const raw = sessionStorage.getItem(scanKey)
          if (!raw) return

          const scanData = JSON.parse(raw) as {
            allDishes: Array<{ id?: string; name: string; description?: string }>
            restaurantName?: string | null
          }

          const dishes = (scanData.allDishes ?? [])
            .filter((d) => d.name?.trim())
            .map((d) => ({ id: d.id, name: d.name, description: d.description }))

          if (dishes.length === 0) return

          // 2. POST to enrichment route
          const res = await fetch('/api/scan/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dishes,
              restaurantName: scanData.restaurantName ?? null,
              ...(dishToRecipeMap && Object.keys(dishToRecipeMap).length > 0
                ? { dishToRecipeMap }
                : {}),
            }),
          })

          if (!res.ok) return

          const enrichData = await res.json() as { data?: { dishes: EnrichedDish[] } }
          const enrichedDishes = enrichData?.data?.dishes
          if (!Array.isArray(enrichedDishes)) return

          // 3. Re-read sessionStorage (may have been updated since the fetch started)
          //    and merge enriched dish data in-place
          const currentRaw = sessionStorage.getItem(scanKey)
          const currentData = currentRaw
            ? (JSON.parse(currentRaw) as { allDishes: Array<Record<string, unknown>> })
            : scanData

          const mergedDishes = (currentData.allDishes ?? []).map((dish) => {
            const enriched = enrichedDishes.find((e) =>
              e.id ? e.id === dish.id : e.name === dish.name
            )
            return enriched ? { ...dish, ...enriched } : dish
          })

          sessionStorage.setItem(
            scanKey,
            JSON.stringify({ ...currentData, allDishes: mergedDishes, enriched: true })
          )

          // 4. Write dish photos + macro totals back to Supabase
          if (dishToRecipeMap && Object.keys(dishToRecipeMap).length > 0) {
            // Photo writes — only for dishes that received a Places photo
            const photoWrites = enrichedDishes
              .filter((d) => d.photoUrl && d.id && dishToRecipeMap[d.id!])
              .map((d) =>
                supabase
                  .from('recipes')
                  .update({ dish_image_url: d.photoUrl, photo_status: 'confirmed' })
                  .eq('id', dishToRecipeMap[d.id!])
              )

            // Macro total writes — only for dishes that received actual USDA macro data.
            // Guard against null: writing null over a previously enriched row would reset it
            // to "not enriched" (AC4: failed dishes retain Phase 1 values, not null values).
            // Promise.allSettled ensures one dish failure doesn't block others.
            // total_fibre_g is always null: fibre not yet in the enrich API response.
            const macroWrites = enrichedDishes
              .filter(
                (d) =>
                  d.id &&
                  dishToRecipeMap[d.id!] &&
                  (d.totalCalories != null || d.totalProtein != null || d.totalCarbs != null || d.totalFat != null)
              )
              .map((d) =>
                supabase
                  .from('recipes')
                  .update({
                    // Only overwrite estimated_calories when USDA returned a value —
                    // preserves the Phase 1 Gemini estimate when USDA lookup failed.
                    ...(d.totalCalories != null ? { estimated_calories: d.totalCalories } : {}),
                    total_protein_g: d.totalProtein,
                    total_carbs_g: d.totalCarbs,
                    total_fat_g: d.totalFat,
                    total_fibre_g: null,
                  })
                  .eq('id', dishToRecipeMap[d.id!])
              )

            // 5. Await all writes before invalidating so the refetch sees all persisted data
            const allWrites = [...photoWrites, ...macroWrites]
            if (allWrites.length > 0) {
              await Promise.allSettled(allWrites)
              void queryClient.invalidateQueries({ queryKey: ['recipes', 'restaurant'] })
              void queryClient.invalidateQueries({ queryKey: ['recipes', 'kept'] })
              void queryClient.invalidateQueries({ queryKey: ['recipes'] })
            }
          }

          // 6. Notify recipe detail pages that enrichment is complete
          window.dispatchEvent(
            new CustomEvent('plately:enriched', { detail: { key: scanKey } })
          )
        } catch {
          // Non-blocking — enrichment is best-effort
        } finally {
          setIsEnriching(false)
        }
      })()
    },
    [queryClient]
  )

  return { enrich, isEnriching }
}
