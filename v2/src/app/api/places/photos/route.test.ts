import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() => vi.fn(() => ({ places: 'places-test-key' as string | undefined })))
const mockGetRestaurantPhotos = vi.hoisted(() => vi.fn().mockResolvedValue([]))

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@/lib/placesPhotos', () => ({ getRestaurantPhotos: mockGetRestaurantPhotos }))

import { GET } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(placeId: string | null) {
  const url = placeId
    ? `http://localhost/api/places/photos?placeId=${encodeURIComponent(placeId)}`
    : 'http://localhost/api/places/photos'
  return new NextRequest(url, { method: 'GET' })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/places/photos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({ places: 'places-test-key' })
    mockGetRestaurantPhotos.mockResolvedValue([])
  })

  // ─── Missing API key ───────────────────────────────────────────────────────

  it('missing Places API key → 503, nested error envelope', async () => {
    mockGetApiKeys.mockReturnValue({ places: undefined })
    const res = await GET(makeReq('place-123'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ message: expect.any(String), code: 'PLACES_SERVICE_UNAVAILABLE' })
    expect(typeof body.error).toBe('object')
  })

  // ─── Zod validation failure ────────────────────────────────────────────────

  it('missing placeId → 422, code: VALIDATION_ERROR, nested envelope', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('empty placeId → 422, code: VALIDATION_ERROR', async () => {
    const res = await GET(makeReq(''))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  // ─── Success ───────────────────────────────────────────────────────────────

  it('valid placeId → 200, data array of photo URLs', async () => {
    mockGetRestaurantPhotos.mockResolvedValue([
      'https://photos.example.com/a.jpg',
      'https://photos.example.com/b.jpg',
    ])
    const res = await GET(makeReq('place-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([
      'https://photos.example.com/a.jpg',
      'https://photos.example.com/b.jpg',
    ])
  })

  it('no photos found → 200, empty data array', async () => {
    mockGetRestaurantPhotos.mockResolvedValue([])
    const res = await GET(makeReq('place-999'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  // ─── P2: getRestaurantPhotos throws ───────────────────────────────────────

  it('getRestaurantPhotos throws → 502, code: PHOTOS_ERROR, nested envelope', async () => {
    mockGetRestaurantPhotos.mockRejectedValue(new Error('Places API down'))
    const res = await GET(makeReq('place-123'))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'PHOTOS_ERROR' })
    expect(typeof body.error).toBe('object')
  })
})
