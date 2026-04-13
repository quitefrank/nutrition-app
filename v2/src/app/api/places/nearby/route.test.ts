import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() => vi.fn(() => ({ places: 'places-test-key' as string | undefined })))
const mockGetRestaurantPhotos = vi.hoisted(() => vi.fn().mockResolvedValue([]))

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@/lib/placesPhotos', () => ({ getRestaurantPhotos: mockGetRestaurantPhotos }))

global.fetch = vi.fn()

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/places/nearby', {
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
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/places/nearby', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({ places: 'places-test-key' })
    mockGetRestaurantPhotos.mockResolvedValue([])
  })

  // ─── Missing API key ───────────────────────────────────────────────────────

  it('missing Places API key → 503, nested error envelope', async () => {
    mockGetApiKeys.mockReturnValue({ places: undefined })
    const res = await POST(makeReq({ lat: 43.6532, lng: -79.3832 }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ message: expect.any(String), code: 'SERVICE_UNAVAILABLE' })
    expect(typeof body.error).toBe('object')
    expect(typeof body.error.message).toBe('string')
  })

  // ─── Invalid JSON ──────────────────────────────────────────────────────────

  it('invalid JSON body → 400, code: INVALID_REQUEST, nested envelope', async () => {
    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  // ─── Zod validation failure ────────────────────────────────────────────────

  it('missing lat/lng → 422, code: VALIDATION_ERROR, nested envelope', async () => {
    const res = await POST(makeReq({ radius: 200 }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('lat out of range → 422, code: VALIDATION_ERROR', async () => {
    const res = await POST(makeReq({ lat: 999, lng: -79.3832 }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  // ─── Places API error ──────────────────────────────────────────────────────

  it('Places API returns non-200 → 502, code: PLACES_ERROR, nested envelope', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
    })
    const res = await POST(makeReq({ lat: 43.6532, lng: -79.3832 }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'PLACES_ERROR' })
  })

  // ─── Success ───────────────────────────────────────────────────────────────

  it('success → data array with placeId, name, address, rating, userRatingCount, photoUrl', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      placesOkResponse([
        {
          id: 'place-123',
          displayName: { text: 'The Burger Joint' },
          formattedAddress: '123 Main St',
          rating: 4.5,
          userRatingCount: 200,
        },
      ])
    )
    mockGetRestaurantPhotos.mockResolvedValue(['https://photos.example.com/1.jpg'])

    const res = await POST(makeReq({ lat: 43.6532, lng: -79.3832 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0]).toMatchObject({
      placeId: 'place-123',
      name: 'The Burger Joint',
      address: '123 Main St',
      rating: 4.5,
      userRatingCount: 200,
      photoUrl: 'https://photos.example.com/1.jpg',
    })
  })
})
