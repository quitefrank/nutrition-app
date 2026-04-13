import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRestaurantPhotos } from '@/lib/placesPhotos'
import { getApiKeys } from '@/lib/api-keys'

const QuerySchema = z.object({
  placeId: z.string().min(1).max(300),
})

// ─── Error helper ─────────────────────────────────────────────────────────────

function apiError(message: string, code: string, status: 400 | 422 | 500 | 502 | 503) {
  return NextResponse.json({ error: { message, code } }, { status })
}

/**
 * GET /api/places/photos?placeId=xxx
 *
 * Returns an array of public HTTPS photo URLs for the given Google Places ID.
 * Used by RestaurantScreen to show a photo strip in the empty state.
 */
export async function GET(req: NextRequest) {
  const placesKey = getApiKeys().places

  if (!placesKey) {
    return apiError('Places service not configured', 'PLACES_SERVICE_UNAVAILABLE', 503)
  }

  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse({ placeId: searchParams.get('placeId') })

  if (!parsed.success) {
    return apiError('placeId is required', 'VALIDATION_ERROR', 422)
  }

  try {
    const photos = await getRestaurantPhotos({ placeId: parsed.data.placeId }, placesKey)
    return NextResponse.json({ data: photos })
  } catch {
    return apiError('Photos unavailable', 'PHOTOS_ERROR', 502)
  }
}
