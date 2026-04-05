import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'
import { getApiKeys } from '@/lib/api-keys'
import type { RecipeSaveRequest, RecipeSaveResponse } from '@/types/api'
import type { Recipe } from '@/types/domain'
import type { Json } from '@/types/database'

interface UsdaMacros {
  caloriesKcal: number | null
  proteinG: number | null
  fatG: number | null
  carbsG: number | null
}

const GRAM_CONVERSIONS: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
}

// Three-tier scale resolver — returns a multiplier for per-100g USDA values
function resolveScale(
  quantity: string | null,
  unit: string | null,
  usdaServingSize: number | null | undefined,
  usdaServingSizeUnit: string | null | undefined
): number {
  const qNum = quantity ? parseFloat(quantity) : NaN
  const validQty = Number.isFinite(qNum) && qNum > 0
  const unitLower = unit?.toLowerCase().trim() ?? ''

  // Tier 1: gram-convertible units
  if (unitLower in GRAM_CONVERSIONS && validQty) {
    return (qNum * GRAM_CONVERSIONS[unitLower]) / 100
  }

  // Tier 2: count/non-metric units — use USDA serving size (grams) as gram equivalent per unit
  if (validQty && usdaServingSize && usdaServingSize > 0) {
    const servingUnitLower = usdaServingSizeUnit?.toLowerCase().trim() ?? ''
    if (['g', 'gram', 'grams'].includes(servingUnitLower)) {
      return (qNum * usdaServingSize) / 100
    }
  }

  // Tier 3: fallback — per-100g reference
  return 1
}

async function lookupUsdaMacros(
  ingredientName: string,
  quantity: string | null,
  unit: string | null,
  usdaKey: string
): Promise<UsdaMacros> {
  if (!ingredientName?.trim()) return { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null }
  const nullResult: UsdaMacros = { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(ingredientName)}&pageSize=1&dataType=Foundation,SR%20Legacy`,
      { headers: { 'X-Api-Key': usdaKey }, signal: controller.signal }
    )
    if (!res.ok) return nullResult
    const data = await res.json()
    const food = data?.foods?.[0]
    if (!food) return nullResult

    const nutrients: Array<{ nutrientId: number; value: number }> = Array.isArray(food.foodNutrients)
      ? food.foodNutrients
      : []
    if (nutrients.length === 0) return nullResult

    const find = (id: number): number | null => {
      const n = nutrients.find(n => n.nutrientId === id)
      return typeof n?.value === 'number' ? n.value : null
    }

    // FDC values are per 100g
    const per100 = {
      cal: find(1008),  // Energy kcal
      pro: find(1003),  // Protein g
      fat: find(1004),  // Total lipid g
      carb: find(1005), // Carbohydrate g
    }

    const scale = resolveScale(quantity, unit, food.servingSize ?? null, food.servingSizeUnit ?? null)
    const round = (v: number | null) => v !== null ? Math.round(v * scale * 10) / 10 : null

    return {
      caloriesKcal: round(per100.cal),
      proteinG: round(per100.pro),
      fatG: round(per100.fat),
      carbsG: round(per100.carb),
    }
  } catch (err) {
    console.warn('[usda] lookup failed for ingredient:', ingredientName, err instanceof Error ? err.message : err)
    return nullResult
  } finally {
    clearTimeout(timer)
  }
}

interface InferredIngredient {
  name: string
  quantity: string | null
  unit: string | null
}

interface InferredRecipe {
  servings: number
  ingredients: InferredIngredient[]
}

const INFER_PROMPT = (dishName: string) =>
  `You are a culinary expert. List the typical ingredients for the dish: "${dishName}".

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "servings": 4,
  "ingredients": [
    { "name": "string", "quantity": "string or null", "unit": "string or null" }
  ]
}

Rules:
- servings: the number of people the quantities below serve (integer 1–12)
- List 5–12 ingredients for a standard recipe preparation (quantities for all servings combined)
- quantity: numeric string for the full recipe amount (e.g. "400"), or null if uncertain
- unit: unit of measure (e.g. "g", "ml", "tbsp", "clove") or null if count/unknown
- If the dish name is not a recognisable food, return { "servings": 1, "ingredients": [] }
- Return valid JSON only`

async function inferIngredientsFromDishName(
  dishName: string,
  geminiKey: string
): Promise<InferredRecipe> {
  try {
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(INFER_PROMPT(dishName))
    const text = result.response.text()
    const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(clean) as { servings?: unknown; ingredients: unknown[] }
    const servings = typeof parsed?.servings === 'number' && parsed.servings >= 1
      ? Math.round(parsed.servings)
      : 1
    if (!Array.isArray(parsed?.ingredients)) return { servings, ingredients: [] }
    const ingredients = parsed.ingredients
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map(i => ({
        name: typeof i.name === 'string' && i.name.trim() ? i.name.trim() : null,
        quantity: typeof i.quantity === 'string' ? i.quantity : null,
        unit: typeof i.unit === 'string' ? i.unit : null,
      }))
      .filter((i): i is InferredIngredient => i.name !== null)
    return { servings, ingredients }
  } catch (err) {
    console.warn('[recipes] Gemini ingredient inference failed:', err instanceof Error ? err.message : err)
    return { servings: 1, ingredients: [] }
  }
}

async function enrichRestaurantImage(
  restaurantId: string,
  googlePlacesId: string,
  placesKey: string | undefined
): Promise<void> {
  if (!placesKey) return

  // Check if already populated — use maybeSingle to avoid PGRST116 on missing row
  const { data: existing } = await supabase
    .from('restaurants')
    .select('restaurant_image_url')
    .eq('id', restaurantId)
    .maybeSingle()

  if (existing?.restaurant_image_url?.startsWith('https://')) return  // CDN URL already stored — skip

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const detailsRes = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlacesId)}`,
      { headers: { 'X-Goog-Api-Key': placesKey, 'X-Goog-FieldMask': 'photos' }, signal: controller.signal }
    )
    clearTimeout(timer)
    if (!detailsRes.ok) return

    const details = await detailsRes.json() as { photos?: Array<{ name: string }> }
    const photoName = details?.photos?.[0]?.name
    if (!photoName) return

    // Resolve photoName to a CDN URL via skipHttpRedirect=true — no API key in URI (SEC-SEC-1.00)
    const photoController = new AbortController()
    const photoTimer = setTimeout(() => photoController.abort(), 3000)
    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
      { headers: { 'X-Goog-Api-Key': placesKey }, signal: photoController.signal }
    )
    clearTimeout(photoTimer)
    if (!photoRes.ok) return
    const photoJson = await photoRes.json() as { photoUri?: string }
    const photoUri = photoJson?.photoUri
    if (!photoUri) return

    // Store CDN URL directly — no API key ever persisted or returned in response body (SEC-SEC-1.00)
    await supabase
      .from('restaurants')
      .update({ restaurant_image_url: photoUri })
      .eq('id', restaurantId)
  } catch (err) {
    console.warn('[recipes] Failed to enrich restaurant image:', err instanceof Error ? err.message : err)
  }
}

export async function POST(req: NextRequest) {
  const { usda: usdaKey, gemini: geminiKey, places: placesKey } = getApiKeys()
  let body: RecipeSaveRequest
  try {
    body = await req.json() as RecipeSaveRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required', code: 'VALIDATION_ERROR' }, { status: 422 })
  }
  if (!Array.isArray(body.ingredients)) {
    return NextResponse.json({ error: 'ingredients must be an array', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  // Resolve restaurant — non-fatal if lookup/creation fails
  let resolvedRestaurantId: string | null = null

  if (body.restaurantGooglePlacesId || body.restaurantName) {
    let existingId: string | null = null
    let skipRestaurant = false

    if (body.restaurantGooglePlacesId) {
      const { data, error: placesLookupError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('google_places_id', body.restaurantGooglePlacesId)
        .maybeSingle()
      if (placesLookupError) {
        // Lookup failed — skip restaurant association to avoid inserting a junk row
        console.warn('Failed to look up restaurant by google_places_id:', placesLookupError.message)
        skipRestaurant = true
      } else {
        existingId = data?.id ?? null
      }
    }

    if (!skipRestaurant && !existingId && body.restaurantName) {
      const { data } = await supabase
        .from('restaurants')
        .select('id')
        .eq('name', body.restaurantName)
        .maybeSingle()
      existingId = data?.id ?? null
    }

    if (!skipRestaurant) {
      if (existingId) {
        await supabase.from('restaurants').update({ updated_at: new Date().toISOString() }).eq('id', existingId)
        resolvedRestaurantId = existingId
      } else {
        const { data: newRestaurant, error: restaurantError } = await supabase
          .from('restaurants')
          .insert({
            name: body.restaurantName ?? 'Unknown Restaurant',
            google_places_id: body.restaurantGooglePlacesId ?? null,
            atmospheric_palette_json: null,
          })
          .select('id')
          .single()

        if (restaurantError) {
          // Non-fatal: continue save without restaurant association
          console.error('Failed to create restaurant:', restaurantError.message)
        } else {
          resolvedRestaurantId = newRestaurant.id
        }
      }

      // Enrich restaurant image — non-fatal, 3s timeout (NFR11)
      if (resolvedRestaurantId && body.restaurantGooglePlacesId) {
        await enrichRestaurantImage(resolvedRestaurantId, body.restaurantGooglePlacesId, placesKey)
      }
    }
  }

  // When no ingredients are supplied (menu scan), infer them + serving count from Gemini
  // before inserting the recipe row so serving_size is correct from the start.
  let ingredientSource = body.ingredients as Array<{ name: string; quantity?: string | null; unit?: string | null; confidenceLevel?: string }>
  let servingSize = body.servingSize ?? 1
  if (ingredientSource.length === 0 && geminiKey) {
    const { servings, ingredients: inferred } = await inferIngredientsFromDishName(body.name.trim(), geminiKey)
    ingredientSource = inferred.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit, confidenceLevel: 'medium' }))
    servingSize = servings
  }

  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      name: body.name.trim(),
      dish_image_url: body.dishImageUrl ?? null,
      confidence_metadata_json: (body.confidenceMetadata ?? null) as Json | null,
      serving_size: servingSize,
      restaurant_id: resolvedRestaurantId,
    })
    .select('id, name, restaurant_id, serving_size, created_at')
    .single()

  if (recipeError || !recipe) {
    return NextResponse.json({ error: 'Failed to save recipe', code: 'DB_ERROR' }, { status: 500 })
  }

  if (ingredientSource.length > 0) {
    // Run USDA lookups in parallel — no-op if usdaKey is falsy
    const macroResults = usdaKey
      ? await Promise.allSettled(
          ingredientSource.map(ing =>
            lookupUsdaMacros(ing.name, ing.quantity ?? null, ing.unit ?? null, usdaKey)
          )
        )
      : ingredientSource.map(() => ({ status: 'fulfilled' as const, value: { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null } }))

    const ingredientRows = ingredientSource.map((ing, i) => {
      const macros = macroResults[i].status === 'fulfilled'
        ? macroResults[i].value
        : { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null }
      return {
        recipe_id: recipe.id,
        name: ing.name,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        confidence_level: (ing.confidenceLevel ?? 'medium') as 'high' | 'medium' | 'low',
        calories_kcal: macros.caloriesKcal,
        protein_g: macros.proteinG,
        fat_g: macros.fatG,
        carbs_g: macros.carbsG,
      }
    })

    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(ingredientRows)

    if (ingError) {
      // Roll back the recipe row — maintain atomicity
      await supabase.from('recipes').delete().eq('id', recipe.id)
      return NextResponse.json({ error: 'Failed to save recipe ingredients', code: 'DB_ERROR' }, { status: 500 })
    }
  }

  const response: RecipeSaveResponse = {
    id: recipe.id,
    name: recipe.name,
    createdAt: recipe.created_at,
    servingSize: recipe.serving_size,
    restaurantId: recipe.restaurant_id,
  }

  return NextResponse.json({ data: response })
}

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')

  let query = supabase
    .from('recipes')
    .select(`
      id,
      name,
      restaurant_id,
      dish_image_url,
      confidence_metadata_json,
      serving_size,
      created_at,
      restaurants ( id, name, google_places_id, atmospheric_palette_json, restaurant_image_url, updated_at )
    `)
    .order('created_at', { ascending: false })

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[recipes GET] Supabase error:', error)
    return NextResponse.json({ error: 'Failed to fetch recipes', code: 'DB_ERROR' }, { status: 500 })
  }

  const recipes: Recipe[] = (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    restaurantId: row.restaurant_id,
    dishImageUrl: row.dish_image_url,
    confidenceMetadataJson: row.confidence_metadata_json as Record<string, unknown> | null,
    servingSize: row.serving_size,
    createdAt: row.created_at,
    restaurant: row.restaurants
      ? {
          id: row.restaurants.id,
          name: row.restaurants.name,
          googlePlacesId: row.restaurants.google_places_id,
          atmosphericPaletteJson: row.restaurants.atmospheric_palette_json as Record<string, unknown> | null,
          restaurantImageUrl: row.restaurants.restaurant_image_url ?? null,
          updatedAt: row.restaurants.updated_at,
        }
      : null,
  }))

  return NextResponse.json({ data: recipes })
}
