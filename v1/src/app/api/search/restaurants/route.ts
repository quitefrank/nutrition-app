import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getApiKeys } from '@/lib/api-keys'
import type { RestaurantSearchResult } from '@/types/api'

interface PlacesPlace {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
}

interface PlacesResponse {
  places?: PlacesPlace[]
}

export async function GET(req: NextRequest) {
  const { places: apiKey } = getApiKeys()

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Restaurant search unavailable', code: 'PLACES_UNAVAILABLE' },
      { status: 503 }
    )
  }

  const rawQ = new URL(req.url).searchParams.get('q')
  const q = rawQ?.trim() ?? ''

  if (!q) {
    return NextResponse.json(
      { error: 'q parameter is required', code: 'INVALID_REQUEST' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ textQuery: q, languageCode: 'en' }),
    })

    if (!response.ok) {
      console.error('[search/restaurants] Places API returned non-ok status:', response.status)
      return NextResponse.json(
        { error: 'Restaurant search unavailable', code: 'PLACES_UNAVAILABLE' },
        { status: 503 }
      )
    }

    const json: PlacesResponse = await response.json()
    const places = json.places ?? []

    const results: RestaurantSearchResult[] = places.map((place) => ({
      googlePlacesId: place.id,
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      imageUrl: null, // photo proxy deferred to story 5.2
    }))

    return NextResponse.json({ data: results })
  } catch (err) {
    console.error('[search/restaurants] Places API error:', err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err))
    return NextResponse.json(
      { error: 'Restaurant search unavailable', code: 'PLACES_UNAVAILABLE' },
      { status: 503 }
    )
  }
}
