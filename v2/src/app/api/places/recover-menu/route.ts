import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiKeys } from '@/lib/api-keys'
import { getRestaurantPhotos } from '@/lib/placesPhotos'
import { supabase } from '@/lib/supabase'

// ─── Request schema ────────────────────────────────────────────────────────────
// SEC-INJ-1.00: placeId validated as non-empty string; used in HTTPS URL path only.
const RequestSchema = z.object({
  placeId: z.string().min(1).max(500).trim(),
  restaurantId: z.string().uuid().optional(),
  restaurantName: z.string().max(200).trim().optional(),
})

// ─── Error response helper ────────────────────────────────────────────────────
function apiError(message: string, code: string, status: 400 | 422 | 500 | 503) {
  return NextResponse.json({ error: { message, code } }, { status })
}

export async function POST(req: NextRequest) {
  const { places: placesKey } = getApiKeys()

  if (!placesKey) {
    return apiError('Places API unavailable', 'PLACES_UNAVAILABLE', 503)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400)
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request'
    return apiError(message, 'VALIDATION_ERROR', 422)
  }

  const { placeId, restaurantId, restaurantName } = parsed.data

  // ── Resolve restaurantId if not provided ──────────────────────────────────
  // Required for deduplication and Supabase insert.
  let resolvedRestaurantId = restaurantId
  if (!resolvedRestaurantId) {
    try {
      const { data, error: lookupError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('place_id', placeId)
        .maybeSingle()
      if (lookupError) return NextResponse.json({ data: { newDishCount: 0 } })
      resolvedRestaurantId = (data as { id: string } | null)?.id ?? undefined
    } catch {
      // Non-fatal: if we can't find the restaurant, return 0 new dishes
      return NextResponse.json({ data: { newDishCount: 0 } })
    }
  }

  if (!resolvedRestaurantId) {
    return NextResponse.json({ data: { newDishCount: 0 } })
  }

  // ── Fetch Places photos ───────────────────────────────────────────────────
  let photoUrls: string[]
  try {
    photoUrls = await getRestaurantPhotos({ placeId }, placesKey, 10)
  } catch {
    // AC4: silent failure — any error from Places returns 0 new dishes
    return NextResponse.json({ data: { newDishCount: 0 } })
  }

  if (photoUrls.length === 0) {
    return NextResponse.json({ data: { newDishCount: 0 } })
  }

  // ── Fetch existing dish names for deduplication ───────────────────────────
  // SEC-INJ-1.00: restaurantId is a validated UUID; used in parameterised query.
  let existingNames: Set<string>
  try {
    const { data: existingRows } = await supabase
      .from('recipes')
      .select('name')
      .eq('restaurant_id', resolvedRestaurantId)
      .neq('status', 'removed')
    existingNames = new Set(
      (existingRows ?? []).map((r: { name: string }) => r.name.toLowerCase().trim())
    )
  } catch {
    existingNames = new Set()
  }

  // ── Scan each photo via /api/scan (parallel, best-effort) ─────────────────
  // Use absolute URL for server-side self-call (Vercel + local dev compatible).
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

  const scanResults = await Promise.allSettled(
    photoUrls.map(async (photoUrl) => {
      const res = await fetch(`${baseUrl}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl,
          restaurantPlaceId: placeId,
          restaurantName,
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) return []
      const json = await res.json() as {
        data?: { dishes: Array<{ name: string; description?: string; calorieEstimate?: number | null }> }
      }
      return json.data?.dishes ?? []
    })
  )

  // ── Collect unique new dishes (not already in the restaurant's set) ────────
  // Deduplication runs at two levels:
  //   1. Against Supabase (existing rows with status != 'removed')
  //   2. Within this batch (same dish returned by multiple photo scans)
  // SEC-DAT-1.00: no dish names or user data written to logs.
  const newDishes: Array<{ name: string; description: string; calorieEstimate: number | null }> = []
  const seenInThisBatch = new Set<string>()

  for (const result of scanResults) {
    if (result.status !== 'fulfilled') continue
    for (const dish of result.value) {
      const key = dish.name.toLowerCase().trim()
      if (!key) continue
      if (existingNames.has(key)) continue
      if (seenInThisBatch.has(key)) continue
      seenInThisBatch.add(key)
      newDishes.push({
        name: dish.name.trim(),
        description: dish.description?.trim() ?? '',
        calorieEstimate: dish.calorieEstimate ?? null,
      })
    }
  }

  if (newDishes.length === 0) {
    return NextResponse.json({ data: { newDishCount: 0 } })
  }

  // ── Insert new dishes into Supabase ──────────────────────────────────────
  // SEC-INJ-1.00: all values pass through Supabase's parameterised insert.
  // SEC-DAT-1.00: no dish names or user data written to logs.
  try {
    const rows = newDishes.map((d) => ({
      restaurant_id: resolvedRestaurantId,
      name: d.name,
      description: d.description,
      estimated_calories: d.calorieEstimate,
      status: 'auto_captured' as const,
      photo_status: 'placeholder' as const,
    }))
    const { error } = await supabase.from('recipes').insert(rows)
    if (error) {
      console.error('[places/recover-menu] Supabase insert error:', error.code)
      return NextResponse.json({ data: { newDishCount: 0 } })
    }
  } catch {
    console.error('[places/recover-menu] Unexpected insert error')
    return NextResponse.json({ data: { newDishCount: 0 } })
  }

  return NextResponse.json({ data: { newDishCount: newDishes.length } })
}
