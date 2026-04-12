import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRestaurantPhotos } from '@/lib/placesPhotos'
import { getApiKeys } from '@/lib/api-keys'

const QuerySchema = z.object({
  placeId: z.string().min(1).max(300),
})

/**
 * GET /api/places/photos?placeId=xxx
 *
 * Returns an array of public HTTPS photo URLs for the given Google Places ID.
 * Used by RestaurantScreen to show a photo strip in the empty state.
 */
export async function GET(req: NextRequest) {
  const placesKey = getApiKeys().places

  if (!placesKey) {
    return NextResponse.json(
      { error: 'Places service not configured', code: 'PLACES_SERVICE_UNAVAILABLE' },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse({ placeId: searchParams.get('placeId') })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'placeId is required', code: 'INVALID_REQUEST' },
      { status: 400 }
    )
  }

  const photos = await getRestaurantPhotos({ placeId: parsed.data.placeId }, placesKey)

  return NextResponse.json({ data: photos })
}
