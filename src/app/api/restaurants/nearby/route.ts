import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getApiKeys } from '@/lib/api-keys'
import type { NearbyRestaurantResult } from '@/types/api'

// Haversine distance in metres between two lat/lng pairs
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET(req: NextRequest) {
  const { places: placesKey } = getApiKeys()

  // Graceful degradation — no Places key means we can't resolve coordinates
  if (!placesKey) {
    return NextResponse.json({ data: [] })
  }

  const params = req.nextUrl.searchParams
  const latRaw = params.get('lat')
  const lngRaw = params.get('lng')
  const radiusRaw = params.get('radius')

  // Validate lat and lng
  if (!latRaw || !lngRaw) {
    return NextResponse.json({ error: 'lat and lng are required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const lat = parseFloat(latRaw)
  const lng = parseFloat(lngRaw)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng must be finite numbers', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'lat must be in [-90,90] and lng in [-180,180]', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const parsedRadius = radiusRaw ? parseInt(radiusRaw, 10) : 200
  if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
    return NextResponse.json({ error: 'radius must be a positive integer', code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  const radius = Math.min(parsedRadius, 50000) // cap at 50km

  // Query restaurants that have at least one recipe and have a google_places_id
  // Limit to 50 to avoid unbounded Places API fan-out
  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('id, name, google_places_id, recipes!inner(id)')
    .not('google_places_id', 'is', null)
    .limit(50)

  if (error) {
    return NextResponse.json({ data: [] })
  }

  if (!restaurants || restaurants.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Fetch coordinates for each candidate restaurant from Places API in parallel
  // Coordinates are used ONLY in-memory for Haversine — never persisted (NFR08)
  const coordResults = await Promise.allSettled(
    restaurants.map(async (r) => {
      const detailsRes = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(r.google_places_id!)}`,
        { headers: { 'X-Goog-Api-Key': placesKey, 'X-Goog-FieldMask': 'location' } }
      )
      if (!detailsRes.ok) throw new Error(`Places API error: ${detailsRes.status}`)
      const details = await detailsRes.json() as { location?: { latitude: number; longitude: number } }
      const location = details?.location
      if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
        throw new Error('No location in response')
      }
      return { restaurant: r, rLat: location.latitude, rLng: location.longitude }
    })
  )

  // Filter to restaurants within radius using Haversine; track distance for sorting
  const nearby: Array<NearbyRestaurantResult & { _dist: number }> = []
  for (const result of coordResults) {
    if (result.status !== 'fulfilled') continue
    const { restaurant, rLat, rLng } = result.value
    const dist = haversineMetres(lat, lng, rLat, rLng)
    if (dist <= radius) {
      const recipeCount = Array.isArray(restaurant.recipes) ? restaurant.recipes.length : 0
      nearby.push({
        id: restaurant.id,
        name: restaurant.name,
        googlePlacesId: restaurant.google_places_id!,
        recipeCount,
        _dist: dist,
      })
    }
  }

  // Sort ascending by distance so data[0] is always the nearest match
  nearby.sort((a, b) => a._dist - b._dist)
  const data: NearbyRestaurantResult[] = nearby.map(({ _dist: _d, ...r }) => r)

  return NextResponse.json({ data })
}
