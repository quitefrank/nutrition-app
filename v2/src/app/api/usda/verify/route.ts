import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiKeys } from '@/lib/api-keys'
import { supabase } from '@/lib/supabase'

// ─── Error helper ──────────────────────────────────────────

function apiError(message: string, code: string, status: 400 | 422 | 503) {
  return NextResponse.json({ error: { message, code } }, { status })
}

// ─── Input schema ──────────────────────────────────────────

const RequestSchema = z.object({
  recipeIds: z.array(z.string().uuid()).min(1).max(50), // P-02: cap fan-out
})

// ─── USDA response schemas (strict) ───────────────────────

const UsdaFoodSchema = z.object({
  fdcId: z.number(),
  description: z.string(),
  dataType: z.string().optional(),
  foodNutrients: z
    .array(
      z.object({
        nutrientId: z.number(),
        nutrientName: z.string().optional(),
        value: z.number().optional(),
      })
    )
    .optional()
    .default([]),
})

const UsdaResponseSchema = z.object({
  foods: z.array(UsdaFoodSchema).default([]),
})

// ─── Nutrient IDs ──────────────────────────────────────────

const NUTRIENT = {
  calories: 1008, // Energy (kcal)
  protein: 1003,  // Protein (g)
  fat: 1004,      // Total Fat (g)
  carbs: 1005,    // Carbohydrate (g)
} as const

// ─── Macro extraction ──────────────────────────────────────

interface ExtractedMacros {
  fdcId: number
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
}

function extractMacros(food: z.infer<typeof UsdaFoodSchema>): ExtractedMacros {
  const get = (id: number) =>
    food.foodNutrients.find((n) => n.nutrientId === id)?.value ?? null

  return {
    fdcId: food.fdcId,
    calories: get(NUTRIENT.calories),
    protein: get(NUTRIENT.protein),
    fat: get(NUTRIENT.fat),
    carbs: get(NUTRIENT.carbs),
  }
}

// ─── USDA fetch ────────────────────────────────────────────

const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const PREFERRED_DATA_TYPES = ['Foundation', 'SR Legacy']

async function fetchUsdaMatch(
  ingredientName: string,
  apiKey: string
): Promise<ExtractedMacros | null> {
  // P-01: key in X-Api-Key header, not URL query string (prevents key in logs/CDN)
  const url = `${USDA_SEARCH_URL}?query=${encodeURIComponent(ingredientName)}&pageSize=3`
  const res = await fetch(url, {
    headers: { 'X-Api-Key': apiKey },
    signal: AbortSignal.timeout(8000), // P-05: abort after 8 s
  })
  if (!res.ok) return null

  const raw = await res.json()

  // P-03: catch Zod errors distinctly from network failures so schema drift is identifiable
  let parsed: z.infer<typeof UsdaResponseSchema>
  try {
    parsed = UsdaResponseSchema.parse(raw)
  } catch (parseErr) {
    console.warn('[usda/verify] Zod parse error for ingredient:', ingredientName, parseErr)
    return null
  }

  // Prefer Foundation Foods or SR Legacy over other data types
  const best =
    parsed.foods.find((f) => PREFERRED_DATA_TYPES.includes(f.dataType ?? '')) ??
    parsed.foods[0] ??
    null

  if (!best) return null
  return extractMacros(best)
}

// ─── Null-safe total computation ───────────────────────────

function sumNullable(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null)
  return valid.length === 0 ? null : valid.reduce((a, b) => a + b, 0)
}

// ─── Handler ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Validate JSON body → 400 on parse error
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400)
  }

  // 2. Validate with RequestSchema → 422 on schema error
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('Request validation failed', 'VALIDATION_ERROR', 422)
  }

  const { recipeIds } = parsed.data
  const keys = getApiKeys()
  // Never fail because USDA key is absent — DEMO_KEY allows limited access
  const usdaKey = keys.usda ?? 'DEMO_KEY'

  // 3. Fetch all recipe_ingredients rows for given recipeIds
  // P-10: narrow projection — no select('*')
  const { data: allIngredients, error: fetchError } = await supabase
    .from('recipe_ingredients')
    .select('id, recipe_id, name, usda_fdc_id, calories_per_serving, protein_g, fat_g, carbs_g')
    .in('recipe_id', recipeIds)

  if (fetchError) {
    console.warn('[usda/verify] Failed to fetch recipe_ingredients:', fetchError.message)
    // IG-1: DB connectivity failure is a service-down condition (ARCH7 → 503)
    return apiError('Service temporarily unavailable', 'DB_SERVICE_UNAVAILABLE', 503)
  }

  const rows = allIngredients ?? []

  // 4. Partition: candidates only — P-08: removed unused `verified` variable
  const unverified = rows.filter((r) => r.usda_fdc_id === null)

  // 5. If no unverified → compute totals from existing rows → return early
  if (unverified.length === 0) {
    const recipes = recipeIds.map((recipeId) => {
      const recipeRows = rows.filter((r) => r.recipe_id === recipeId)
      return {
        recipeId,
        totalCalories: sumNullable(recipeRows.map((r) => r.calories_per_serving)),
        totalProtein: sumNullable(recipeRows.map((r) => r.protein_g)),
        totalFat: sumNullable(recipeRows.map((r) => r.fat_g)),
        totalCarbs: sumNullable(recipeRows.map((r) => r.carbs_g)),
      }
    })

    return NextResponse.json({
      data: {
        verified: 0,
        total: 0,
        recipes,
      },
    })
  }

  // 6. Fire all unverified ingredient lookups in parallel
  const usdaResults = await Promise.allSettled(
    unverified.map((ing) => fetchUsdaMatch(ing.name, usdaKey))
  )

  // 7. Process results and collect DB updates
  // P-04: no verifiedCount here — it is derived from updatedMacroMap.size after writes
  const updatePromises: PromiseLike<unknown>[] = []

  for (let i = 0; i < unverified.length; i++) {
    const ing = unverified[i]
    const result = usdaResults[i]

    if (result.status === 'rejected') {
      console.warn('[usda/verify] USDA fetch failed for ingredient:', ing.name, result.reason)
      continue
    }

    const macros = result.value
    if (!macros) {
      // No match found — leave row unchanged
      continue
    }

    // Update this ingredient with USDA data
    updatePromises.push(
      supabase
        .from('recipe_ingredients')
        .update({
          usda_fdc_id: macros.fdcId,
          calories_per_serving: macros.calories,
          protein_g: macros.protein,
          fat_g: macros.fat,
          carbs_g: macros.carbs,
          confidence: 'high',
        })
        .eq('id', ing.id)
        .then(({ error }) => {
          if (error) {
            console.warn('[usda/verify] DB update failed for ingredient:', ing.name, error.message)
          }
          return { ing, macros, error }
        })
    )
  }

  // Await all DB updates before computing totals (not fire-and-forget)
  const updateResults = await Promise.allSettled(updatePromises)

  // Build a map of ingredient ID → updated macros for total computation
  const updatedMacroMap = new Map<string, ExtractedMacros>()
  for (const result of updateResults) {
    if (result.status === 'fulfilled') {
      const { ing, macros, error } = result.value as {
        ing: typeof unverified[0]
        macros: ExtractedMacros
        error: unknown
      }
      if (!error) {
        updatedMacroMap.set(ing.id, macros)
      }
    }
  }

  // P-04: count only ingredients that were actually persisted
  const verifiedCount = updatedMacroMap.size

  // 8. Re-compute per-recipe totals using updated + existing data
  const recipeResults: Array<{
    recipeId: string
    totalCalories: number | null
    totalProtein: number | null
    totalFat: number | null
    totalCarbs: number | null
  }> = []

  for (const recipeId of recipeIds) {
    const recipeRows = rows.filter((r) => r.recipe_id === recipeId)

    const calorieVals: (number | null)[] = []
    const proteinVals: (number | null)[] = []
    const fatVals: (number | null)[] = []
    const carbVals: (number | null)[] = []

    for (const row of recipeRows) {
      const updated = updatedMacroMap.get(row.id)
      if (updated) {
        calorieVals.push(updated.calories)
        proteinVals.push(updated.protein)
        fatVals.push(updated.fat)
        carbVals.push(updated.carbs)
      } else {
        calorieVals.push(row.calories_per_serving)
        proteinVals.push(row.protein_g)
        fatVals.push(row.fat_g)
        carbVals.push(row.carbs_g)
      }
    }

    const rawCalories = sumNullable(calorieVals)
    // P-07: round calories consistently — response and DB write agree on the same value
    const totalCalories = rawCalories !== null ? Math.round(rawCalories) : null

    recipeResults.push({
      recipeId,
      totalCalories,
      totalProtein: sumNullable(proteinVals),
      totalFat: sumNullable(fatVals),
      totalCarbs: sumNullable(carbVals),
    })
  }

  // 10. P-06: write recipe totals in parallel (not serial await in loop)
  await Promise.allSettled(
    recipeResults
      .filter((r): r is typeof recipeResults[0] & { totalCalories: number } =>
        r.totalCalories !== null
      )
      .map((r) =>
        supabase
          .from('recipes')
          .update({ estimated_calories: r.totalCalories })
          .eq('id', r.recipeId)
          .then(({ error }) => {
            if (error) {
              console.warn('[usda/verify] Failed to update recipe totals:', r.recipeId, error.message)
            }
          })
      )
  )

  // 11. Return result
  return NextResponse.json({
    data: {
      verified: verifiedCount,
      total: unverified.length,
      recipes: recipeResults,
    },
  })
}
