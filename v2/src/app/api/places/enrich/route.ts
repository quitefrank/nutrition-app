import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiKeys } from '@/lib/api-keys'
import { supabase } from '@/lib/supabase'
import { getRestaurantPhotos } from '@/lib/placesPhotos'

// ─── Error helper ─────────────────────────────────────────────────────────────

// P4: 404 added to the union so all HTTP error codes route through this helper.
function apiError(message: string, code: string, status: 400 | 404 | 422 | 503) {
  return NextResponse.json({ error: { message, code } }, { status })
}

// ─── Input schema ─────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  restaurantId: z.string().uuid(),
})

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * POST /api/places/enrich
 *
 * Fetches Google Places photos for a restaurant and assigns them to its
 * placeholder-status recipes. One batched Places request per restaurant (NFR19).
 *
 * Caching: once reference_image_url is set on the restaurant, subsequent calls
 * reuse it for any new placeholder recipes without triggering another Places API
 * call. Only the first enrichment pass (reference_image_url === null) calls Places.
 *
 * Body: { "restaurantId": "uuid" }
 *
 * TODO(SEC/D1): This route performs no session or auth check. Any caller with a
 * valid restaurantId can trigger billable Places API calls and overwrite recipe
 * photo data. Add Supabase Auth session validation before production exposure.
 *
 * NOTE(D2): No idempotency guard. Concurrent calls for the same restaurantId
 * may double-assign photos and incur duplicate Places API charges. Add a
 * DB-level lock or idempotency key header when quota becomes a concern.
 */
export async function POST(req: NextRequest) {
  // Step 1 — API key guard (ARCH18)
  const placesKey = getApiKeys().places
  if (!placesKey) {
    return apiError('Places service not configured', 'PLACES_SERVICE_UNAVAILABLE', 503)
  }

  // Step 2 — Parse request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400)
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('Invalid request', 'VALIDATION_ERROR', 422)
  }

  const { restaurantId } = parsed.data

  // Step 3 — Fetch restaurant row (P1: check error field)
  const { data: restaurant, error: restaurantErr } = await supabase
    .from('restaurants')
    .select('id, place_id, reference_image_url')
    .eq('id', restaurantId)
    .maybeSingle()

  if (restaurantErr) {
    return apiError('Database error', 'DATABASE_ERROR', 503)
  }

  if (!restaurant) {
    return apiError('Restaurant not found', 'NOT_FOUND', 404)
  }

  // Step 4 — Early exit: no place_id (P3: trim catches empty string "")
  if (!restaurant.place_id?.trim()) {
    return NextResponse.json({
      data: { restaurantId, photosAssigned: 0, skipped: true, reason: 'no_place_id' },
    })
  }

  // Step 5 — Load recipes; derive placeholder list (P1: check error field)
  const { data: allRecipes, error: recipesErr } = await supabase
    .from('recipes')
    .select('id, photo_status, dish_image_url')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'removed')

  if (recipesErr) {
    return apiError('Database error', 'DATABASE_ERROR', 503)
  }

  const recipes = allRecipes ?? []

  // Only placeholder recipes need photo assignment.
  // suppressed recipes (low-confidence, hidden) are intentionally excluded:
  // they do not receive photos and do not block the already_enriched check (I1).
  const placeholderRecipes = recipes.filter(r => r.photo_status === 'placeholder')

  // Cache check: no placeholder recipes AND cover photo already set → fully enriched.
  // P2: reference_image_url is required — a null cover photo means enrichment is
  // incomplete even if all recipe statuses are confirmed/suppressed.
  const alreadyEnriched =
    recipes.length > 0 &&
    placeholderRecipes.length === 0 &&
    !!restaurant.reference_image_url

  if (alreadyEnriched) {
    return NextResponse.json({
      data: { restaurantId, photosAssigned: 0, skipped: true, reason: 'already_enriched' },
    })
  }

  // Step 6a — Repeat enrichment pass: reference_image_url already set (I2 cache).
  // Reuse the cached cover photo for any new placeholder recipes without calling
  // the Places API again. Satisfies AC2's no-repeat-call requirement.
  if (restaurant.reference_image_url && placeholderRecipes.length > 0) {
    let photosAssigned = 0
    for (const recipe of placeholderRecipes) {
      const { error: updateErr } = await supabase
        .from('recipes')
        .update({ dish_image_url: restaurant.reference_image_url, photo_status: 'confirmed' })
        .eq('id', recipe.id)
      if (updateErr) {
        console.error(`[places/enrich] recipe update failed for ${recipe.id}:`, updateErr.message)
      } else {
        photosAssigned++
      }
    }
    return NextResponse.json({ data: { restaurantId, photosAssigned } })
  }

  // Step 6 — First enrichment pass: call getRestaurantPhotos once (NFR19)
  let photos: string[]
  try {
    photos = await getRestaurantPhotos({ placeId: restaurant.place_id }, placesKey, 10)
  } catch {
    return apiError('Photos unavailable', 'PLACES_UNAVAILABLE', 503)
  }

  // Step 7 — Assign photos round-robin to placeholder recipes (P1: check update errors)
  let photosAssigned = 0

  for (let i = 0; i < placeholderRecipes.length; i++) {
    if (photos.length === 0) break
    const photo = photos[i % photos.length]
    const recipe = placeholderRecipes[i]

    const { error: updateErr } = await supabase
      .from('recipes')
      .update({ dish_image_url: photo, photo_status: 'confirmed' })
      .eq('id', recipe.id)

    if (updateErr) {
      console.error(`[places/enrich] recipe update failed for ${recipe.id}:`, updateErr.message)
    } else {
      photosAssigned++
    }
  }

  // Step 8 — Update restaurants.reference_image_url if still null (ARCH15, P1: check error)
  if (photos.length > 0 && !restaurant.reference_image_url) {
    const { error: refUpdateErr } = await supabase
      .from('restaurants')
      .update({ reference_image_url: photos[0] })
      .eq('id', restaurantId)
    if (refUpdateErr) {
      console.error(`[places/enrich] restaurant cover photo update failed:`, refUpdateErr.message)
    }
  }

  // Step 9 — Return success
  return NextResponse.json({ data: { restaurantId, photosAssigned } })
}
