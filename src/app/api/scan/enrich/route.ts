import 'server-only'
import { NextResponse } from 'next/server'
import { getApiKeys } from '@/lib/api-keys'
import type { ScanResult, DishResult, IngredientResult, EnrichRequest } from '@/types/api'

async function getPlacesDishPhoto(dishName: string, placesKey: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    // Step 1: Text Search to get a photo reference
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': placesKey,
        'X-Goog-FieldMask': 'places.photos',
      },
      body: JSON.stringify({ textQuery: `${dishName} dish food`, pageSize: 1 }),
      signal: controller.signal,
    })
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const photoName = searchData?.places?.[0]?.photos?.[0]?.name
    if (!photoName) return null

    // Step 2: Fetch photo URI directly — skipHttpRedirect=true returns JSON with photoUri (no API key in URI)
    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&skipHttpRedirect=true`,
      {
        headers: { 'X-Goog-Api-Key': placesKey },
        signal: controller.signal,
      }
    )
    if (!photoRes.ok) return null
    const photoData = await photoRes.json()
    const photoUri: unknown = photoData?.photoUri
    // Validate scheme before returning — only accept https: URIs
    return typeof photoUri === 'string' && photoUri.startsWith('https://') ? photoUri : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function getUsdaConfidenceUpgrades(
  dishName: string,
  ingredients: IngredientResult[],
  usdaKey: string
): Promise<Map<string, 'medium'>> {
  const upgrades = new Map<string, 'medium'>()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(dishName)}&pageSize=5`,
      { headers: { 'X-Api-Key': usdaKey }, signal: controller.signal }
    )
    if (!res.ok) return upgrades
    const data = await res.json()
    if (!Array.isArray(data?.foods) || data.foods.length === 0) return upgrades

    // Get the set of ingredient name tokens from USDA results
    const usdaIngredients = new Set<string>()
    for (const food of data.foods) {
      if (typeof food.description === 'string') {
        food.description.toLowerCase().split(/[,;()]+/).forEach((token: string) => {
          const t = token.trim()
          if (t.length > 2) usdaIngredients.add(t)
        })
      }
    }

    // Upgrade low-confidence ingredients that appear in USDA results
    for (const ing of ingredients) {
      if (typeof ing.name === 'string' && ing.confidenceLevel === 'low') {
        const ingLower = ing.name.toLowerCase()
        const matched = [...usdaIngredients].some(
          (u) => u.includes(ingLower) || ingLower.includes(u)
        )
        if (matched) upgrades.set(ing.name, 'medium')
      }
    }
  } catch {
    // USDA failure → no upgrades
  } finally {
    clearTimeout(timer)
  }
  return upgrades
}

export async function POST(request: Request) {
  try {
    const { places: placesKey, usda: usdaKey } = getApiKeys()

    let body: { scanId?: unknown; dishes?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_REQUEST' }, { status: 400 })
    }

    const { scanId, dishes } = body as EnrichRequest

    if (
      !scanId ||
      typeof scanId !== 'string' ||
      !Array.isArray(dishes) ||
      dishes.length === 0 ||
      !dishes.every((d) => typeof d.name === 'string')
    ) {
      return NextResponse.json({ error: 'scanId and dishes are required', code: 'INVALID_REQUEST' }, { status: 400 })
    }

    // Guard: no API keys → 503 immediately (before any enrichment work)
    if (!placesKey && !usdaKey) {
      return NextResponse.json(
        { error: 'Enrichment service unavailable', code: 'ENRICH_SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }

    // Run enrichment for all dishes in parallel
    const enrichedDishes = await Promise.all(
      dishes.map(async (dish): Promise<DishResult> => {
        // Run Places and USDA in parallel for each dish
        const [placesResult, usdaResult] = await Promise.allSettled([
          placesKey ? getPlacesDishPhoto(dish.name, placesKey) : Promise.resolve(null),
          usdaKey ? getUsdaConfidenceUpgrades(dish.name, dish.ingredients, usdaKey) : Promise.resolve(new Map()),
        ])

        const imageUrl = placesResult.status === 'fulfilled' ? (placesResult.value ?? null) : null
        const upgrades = usdaResult.status === 'fulfilled' ? usdaResult.value : new Map()

        const enrichedIngredients: IngredientResult[] = dish.ingredients.map((ing) => ({
          ...ing,
          confidenceLevel: upgrades.has(ing.name) ? upgrades.get(ing.name)! : ing.confidenceLevel,
        }))

        return {
          name: dish.name,
          description: '', // client merges over existing cached description
          calorieEstimate: null, // client merges over existing cached calorie value
          ingredients: enrichedIngredients,
          imageUrl,
        }
      })
    )

    const result: ScanResult = {
      scanId,
      type: 'menu', // client overrides with actual type from original scan during merge
      dishes: enrichedDishes,
      confidenceSource: 'multi-source',
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('[scan/enrich] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
