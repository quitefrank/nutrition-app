import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getApiKeys } from '@/lib/api-keys'

const MAX_RADIUS_M = 50_000
const DEFAULT_RADIUS_M = 200
const MAX_RESULTS = 5

export async function GET(req: NextRequest) {
  const { places: placesKey } = getApiKeys()

  if (!placesKey) {
    return NextResponse.json(
      { error: 'Location service not configured', code: 'SERVICE_UNAVAILABLE' },
      { status: 503 }
    )
  }

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
  const radius = Math.min(
    parseFloat(req.nextUrl.searchParams.get('radius') ?? String(DEFAULT_RADIUS_M)),
    MAX_RADIUS_M
  )

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: 'lat and lng are required and must be valid coordinates', code: 'INVALID_REQUEST' },
      { status: 400 }
    )
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    let res: Response
    try {
      res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': placesKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
        },
        body: JSON.stringify({
          includedTypes: ['restaurant', 'cafe', 'meal_takeaway', 'fast_food_restaurant'],
          maxResultCount: MAX_RESULTS,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius,
            },
          },
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      console.error('[nearby-places] Places API error:', res.status)
      return NextResponse.json(
        { error: 'Location lookup failed', code: 'PLACES_ERROR' },
        { status: 502 }
      )
    }

    const data = await res.json() as {
      places?: Array<{
        id?: string
        displayName?: { text?: string }
        formattedAddress?: string
      }>
    }

    const results = (data.places ?? [])
      .filter((p) => p.id && p.displayName?.text)
      .map((p) => ({
        googlePlacesId: p.id!,
        name: p.displayName!.text!,
        address: p.formattedAddress ?? '',
      }))

    return NextResponse.json({ data: results })
  } catch (error) {
    console.error('[nearby-places] Unexpected error:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
