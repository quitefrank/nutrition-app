import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() => vi.fn(() => ({ places: 'places-test-key' as string | undefined })))
const mockGetRestaurantPhotos = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockSupabaseFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@/lib/placesPhotos', () => ({ getRestaurantPhotos: mockGetRestaurantPhotos }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mockSupabaseFrom } }))

global.fetch = vi.fn()

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/places/search', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function placesOkResponse(places: unknown[] = []) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ places }),
    text: vi.fn().mockResolvedValue('ok'),
  }
}

/** Build a Supabase fluent chain mock that resolves with returnValue at .limit() */
function makeSupabaseChain(returnValue: { data: unknown; error: null | { message: string } }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  }
  mockSupabaseFrom.mockReturnValue(chain)
  return chain
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/places/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({ places: 'places-test-key' })
    mockGetRestaurantPhotos.mockResolvedValue([])
    // Default: cache miss (empty result) so tests that don't care about caching
    // fall through to the fetch path without extra setup
    makeSupabaseChain({ data: [], error: null })
  })

  // ─── Missing API key ───────────────────────────────────────────────────────

  it('missing Places API key → 503, nested error envelope', async () => {
    mockGetApiKeys.mockReturnValue({ places: undefined })
    const res = await POST(makeReq({ query: 'pizza' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ message: expect.any(String), code: 'PLACES_UNAVAILABLE' })
    expect(typeof body.error).toBe('object')
  })

  // ─── Invalid JSON ──────────────────────────────────────────────────────────

  it('invalid JSON body → 400, code: INVALID_REQUEST, nested envelope', async () => {
    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  // ─── Zod validation failure ────────────────────────────────────────────────

  it('missing query → 422, code: VALIDATION_ERROR, nested envelope', async () => {
    const res = await POST(makeReq({ lat: 43.6, lng: -79.4 }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('empty string query → 422, code: VALIDATION_ERROR', async () => {
    const res = await POST(makeReq({ query: '' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  // ─── Places API error ──────────────────────────────────────────────────────

  it('Places API returns non-200 → 503, code: PLACES_UNAVAILABLE, nested envelope', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('error'),
    })
    const res = await POST(makeReq({ query: 'pizza' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'PLACES_UNAVAILABLE' })
  })

  // ─── Success ───────────────────────────────────────────────────────────────

  it('success → data array with placeId, name, address, rating, userRatingCount, photoUrl', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      placesOkResponse([
        {
          id: 'place-456',
          displayName: { text: 'Pizza Palace' },
          formattedAddress: '456 Elm St',
          rating: 4.2,
          userRatingCount: 100,
        },
      ])
    )
    mockGetRestaurantPhotos.mockResolvedValue(['https://photos.example.com/pizza.jpg'])

    const res = await POST(makeReq({ query: 'pizza' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0]).toMatchObject({
      placeId: 'place-456',
      name: 'Pizza Palace',
      address: '456 Elm St',
      rating: 4.2,
      userRatingCount: 100,
      photoUrl: 'https://photos.example.com/pizza.jpg',
    })
  })

  // ─── Result cap ───────────────────────────────────────────────────────────

  it('Places returns 7 results → data array has at most 5 entries', async () => {
    const manyPlaces = Array.from({ length: 7 }, (_, i) => ({
      id: `place-${i}`,
      displayName: { text: `Restaurant ${i}` },
      formattedAddress: `${i} Main St`,
      rating: 4.0,
      userRatingCount: 50,
    }))
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(placesOkResponse(manyPlaces))

    const res = await POST(makeReq({ query: 'restaurant' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeLessThanOrEqual(5)
  })

  // ─── Caching ───────────────────────────────────────────────────────────────

  it('cache hit (restaurant in DB with place_id) → returns cached data without calling fetch', async () => {
    makeSupabaseChain({
      data: [
        {
          id: 'db-uuid-1',
          name: 'Sala Thai',
          place_id: 'ChIJcached123',
          address: '99 Queen St',
          rating: 4.7,
          user_ratings_total: 310,
          reference_image_url: 'https://cached.example.com/sala.jpg',
        },
      ],
      error: null,
    })

    const res = await POST(makeReq({ query: 'Sala Thai' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0]).toMatchObject({
      placeId: 'ChIJcached123',
      name: 'Sala Thai',
      address: '99 Queen St',
      rating: 4.7,
      userRatingCount: 310,
      photoUrl: 'https://cached.example.com/sala.jpg',
    })
    // fetch must NOT have been called — cache short-circuits Places API
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('cache miss (no matching restaurant in DB) → calls Places API normally', async () => {
    makeSupabaseChain({ data: [], error: null })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      placesOkResponse([
        {
          id: 'place-live',
          displayName: { text: 'New Restaurant' },
          formattedAddress: '1 New St',
          rating: 4.0,
          userRatingCount: 20,
        },
      ])
    )

    const res = await POST(makeReq({ query: 'New Restaurant' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0].placeId).toBe('place-live')
    // fetch SHOULD have been called for cache miss
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('cache hit → photoUrl sourced from restaurants.reference_image_url (may be null)', async () => {
    makeSupabaseChain({
      data: [
        {
          id: 'db-uuid-2',
          name: 'No Photo Place',
          place_id: 'ChIJnoPhoto',
          address: '5 Dark Alley',
          rating: null,
          user_ratings_total: null,
          reference_image_url: null, // No photo stored yet
        },
      ],
      error: null,
    })

    const res = await POST(makeReq({ query: 'No Photo Place' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].photoUrl).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // ─── Error envelope shape ─────────────────────────────────────────────────

  it('all error responses use nested { error: { message, code } } — not flat { error: string }', async () => {
    // Test with a validation error as representative sample
    const res = await POST(makeReq({ query: '' }))
    const body = await res.json()
    // error must be an object, not a string
    expect(typeof body.error).toBe('object')
    expect(body.error).toHaveProperty('message')
    expect(body.error).toHaveProperty('code')
  })
})
