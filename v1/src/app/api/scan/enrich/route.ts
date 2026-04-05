import 'server-only'
import { NextResponse } from 'next/server'
import { getApiKeys } from '@/lib/api-keys'
import type { ScanResult, DishResult, IngredientResult, EnrichRequest } from '@/types/api'

/** Fetch food photos from a specific restaurant via Google Places API.
 *  If placeId is provided, skips the text-search step.
 *  Returns up to maxPhotos CDN URLs, or an empty array on failure. */
async function getRestaurantPhotos(
  opts: { placeId?: string; restaurantName?: string },
  placesKey: string,
  maxPhotos = 10,
): Promise<{ placeId: string; photos: string[] }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    let placeId = opts.placeId ?? null

    // Step 1: Resolve name → placeId via Text Search (skipped when placeId already known)
    if (!placeId && opts.restaurantName) {
      const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': placesKey,
          'X-Goog-FieldMask': 'places.id',
        },
        body: JSON.stringify({ textQuery: opts.restaurantName, pageSize: 1 }),
        signal: controller.signal,
      })
      if (!searchRes.ok) return { placeId: '', photos: [] }
      const searchData = await searchRes.json() as { places?: Array<{ id?: string }> }
      placeId = searchData?.places?.[0]?.id ?? null
    }

    if (!placeId) return { placeId: '', photos: [] }

    // Step 2: Fetch photo references for the resolved place
    const detailsRes = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          'X-Goog-Api-Key': placesKey,
          'X-Goog-FieldMask': 'photos',
        },
        signal: controller.signal,
      }
    )
    if (!detailsRes.ok) return { placeId, photos: [] }
    const details = await detailsRes.json() as { photos?: Array<{ name: string }> }
    const photoRefs = (details?.photos ?? []).slice(0, maxPhotos)
    if (photoRefs.length === 0) return { placeId, photos: [] }

    // Step 3: Resolve each photo reference → CDN URL in parallel
    const photoUrls = await Promise.all(
      photoRefs.map(async ({ name }) => {
        try {
          const photoRes = await fetch(
            `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&skipHttpRedirect=true`,
            { headers: { 'X-Goog-Api-Key': placesKey }, signal: controller.signal }
          )
          if (!photoRes.ok) return null
          const photoJson = await photoRes.json() as { photoUri?: string }
          const uri = photoJson?.photoUri
          // Validate scheme — only accept https: URIs (SEC-SEC-1.00)
          return typeof uri === 'string' && uri.startsWith('https://') ? uri : null
        } catch {
          return null
        }
      })
    )

    return { placeId, photos: photoUrls.filter((u): u is string => u !== null) }
  } catch {
    return { placeId: opts.placeId ?? '', photos: [] }
  } finally {
    clearTimeout(timer)
  }
}

/** Fallback: generic dish photo via Google Custom Search (used when no restaurant context). */
async function getDishPhoto(dishName: string, cseKey: string, cseCx: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const params = new URLSearchParams({
      key: cseKey,
      cx: cseCx,
      q: `${dishName} food dish recipe`,
      searchType: 'image',
      num: '1',
      safe: 'active',
      imgType: 'photo',
      imgSize: 'medium',
    })
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json() as { items?: Array<{ link?: string }> }
    const link = data?.items?.[0]?.link
    // Validate scheme before returning — only accept https: URIs (SEC-SEC-1.00)
    return typeof link === 'string' && link.startsWith('https://') ? link : null
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
    const { places: placesKey, usda: usdaKey, cseKey, cseCx } = getApiKeys()

    let body: { scanId?: unknown; dishes?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_REQUEST' }, { status: 400 })
    }

    const { scanId, dishes, restaurantName, restaurantGooglePlacesId } = body as EnrichRequest

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
    if (!placesKey && !cseKey && !cseCx && !usdaKey) {
      return NextResponse.json(
        { error: 'Enrichment service unavailable', code: 'ENRICH_SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }

    // Resolve restaurant photos once for all dishes (when restaurant context is available)
    let restaurantPhotos: string[] = []
    let resolvedPlaceId: string | null = restaurantGooglePlacesId ?? null
    if (placesKey && (restaurantGooglePlacesId || restaurantName)) {
      const result = await getRestaurantPhotos(
        { placeId: restaurantGooglePlacesId ?? undefined, restaurantName: restaurantName ?? undefined },
        placesKey,
      )
      restaurantPhotos = result.photos
      if (result.placeId) resolvedPlaceId = result.placeId
    }

    // Run enrichment for all dishes in parallel
    const enrichedDishes = await Promise.all(
      dishes.map(async (dish, i): Promise<DishResult> => {
        // Image: use restaurant photo (round-robin) if available, else CSE fallback
        const imagePromise: Promise<string | null> = restaurantPhotos.length > 0
          ? Promise.resolve(restaurantPhotos[i % restaurantPhotos.length])
          : cseKey && cseCx
            ? getDishPhoto(dish.name, cseKey, cseCx)
            : Promise.resolve(null)

        const [imageResult, usdaResult] = await Promise.allSettled([
          imagePromise,
          usdaKey ? getUsdaConfidenceUpgrades(dish.name, dish.ingredients, usdaKey) : Promise.resolve(new Map()),
        ])

        const imageUrl = imageResult.status === 'fulfilled' ? (imageResult.value ?? null) : null
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
      ...(resolvedPlaceId ? { restaurantGooglePlacesId: resolvedPlaceId } : {}),
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('[scan/enrich] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
