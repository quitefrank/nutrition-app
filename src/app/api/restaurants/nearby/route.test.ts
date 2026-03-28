import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ places: 'test-places-key', gemini: undefined, usda: undefined })),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/restaurants/nearby')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString())
}

const mockRestaurant = {
  id: 'rest-uuid-1',
  name: 'Le Canard',
  google_places_id: 'ChIJ_gp-abc123',
  recipes: [{ id: 'r1' }, { id: 'r2' }],
}

// Places API response with coordinates at same location as user (0 distance)
const placesLocationResponse = {
  ok: true,
  json: async () => ({
    location: { latitude: 51.5074, longitude: -0.1278 },
  }),
}

// Places API response with coordinates far away (>200m)
const placesLocationFarResponse = {
  ok: true,
  json: async () => ({
    location: { latitude: 52.0, longitude: -0.1278 },  // ~55km away
  }),
}

describe('GET /api/restaurants/nearby', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('valid coords → returns matching restaurant within radius', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [mockRestaurant], error: null }),
    }))
    mockFetch.mockResolvedValue(placesLocationResponse)

    const res = await GET(makeRequest({ lat: '51.5074', lng: '-0.1278' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('rest-uuid-1')
    expect(body.data[0].name).toBe('Le Canard')
    expect(body.data[0].googlePlacesId).toBe('ChIJ_gp-abc123')
    expect(body.data[0].recipeCount).toBe(2)
  })

  it('valid coords → restaurant too far away returns empty array', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [mockRestaurant], error: null }),
    }))
    mockFetch.mockResolvedValue(placesLocationFarResponse)

    const res = await GET(makeRequest({ lat: '51.5074', lng: '-0.1278' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(0)
  })

  it('missing lat → 400 VALIDATION_ERROR', async () => {
    const res = await GET(makeRequest({ lng: '-0.1278' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('missing lng → 400 VALIDATION_ERROR', async () => {
    const res = await GET(makeRequest({ lat: '51.5074' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('non-finite lat → 400 VALIDATION_ERROR', async () => {
    const res = await GET(makeRequest({ lat: 'not-a-number', lng: '-0.1278' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('no Places API key → 200 empty array (graceful degradation)', async () => {
    const { getApiKeys } = await import('@/lib/api-keys')
    vi.mocked(getApiKeys).mockReturnValueOnce({ places: undefined, gemini: undefined, usda: undefined })

    const res = await GET(makeRequest({ lat: '51.5074', lng: '-0.1278' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('no matching restaurants in DB → 200 empty array', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }))

    const res = await GET(makeRequest({ lat: '51.5074', lng: '-0.1278' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('Places API fetch fails for one restaurant → skipped silently, others returned', async () => {
    const twoRestaurants = [
      mockRestaurant,
      { id: 'rest-uuid-2', name: 'Other Place', google_places_id: 'ChIJ_other', recipes: [{ id: 'r3' }] },
    ]
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: twoRestaurants, error: null }),
    }))
    // First succeeds (within radius), second fails
    mockFetch
      .mockResolvedValueOnce(placesLocationResponse)
      .mockResolvedValueOnce({ ok: false, status: 404 })

    const res = await GET(makeRequest({ lat: '51.5074', lng: '-0.1278' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('rest-uuid-1')
  })

  it('Supabase DB error → 200 empty array (graceful)', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    }))

    const res = await GET(makeRequest({ lat: '51.5074', lng: '-0.1278' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('coordinates are NOT included in the response body (NFR08)', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [mockRestaurant], error: null }),
    }))
    mockFetch.mockResolvedValue(placesLocationResponse)

    const res = await GET(makeRequest({ lat: '51.5074', lng: '-0.1278' }))
    const body = await res.json() as { data: unknown[] }
    const responseText = JSON.stringify(body)
    // User coordinates must NOT appear in response
    expect(responseText).not.toContain('51.5074')
    expect(responseText).not.toContain('-0.1278')
  })
})
