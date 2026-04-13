import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() =>
  vi.fn(() => ({
    gemini: 'AItest123456789012345678901234567890' as string | undefined,
    places: 'places-test-key' as string | undefined,
  }))
)
const mockGetCachedMenu = vi.hoisted(() => vi.fn().mockResolvedValue(null))
const mockCacheMenu = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockGetRestaurantPhotos = vi.hoisted(() => vi.fn().mockResolvedValue([]))

const { mockGenerateContent, MockGoogleGenerativeAI } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  const MockGoogleGenerativeAI = vi.fn(function MockGoogleGenerativeAI() {
    return {
      getGenerativeModel: vi.fn(() => ({ generateContent: mockGenerateContent })),
    }
  })
  return { mockGenerateContent, MockGoogleGenerativeAI }
})

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@/lib/menuCache', () => ({ getCachedMenu: mockGetCachedMenu, cacheMenu: mockCacheMenu }))
vi.mock('@/lib/placesPhotos', () => ({ getRestaurantPhotos: mockGetRestaurantPhotos }))
vi.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: MockGoogleGenerativeAI }))

global.fetch = vi.fn()

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/restaurants/auto-scan', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/restaurants/auto-scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({
      gemini: 'AItest123456789012345678901234567890',
      places: 'places-test-key',
    })
    mockGetCachedMenu.mockResolvedValue(null)
    mockGetRestaurantPhotos.mockResolvedValue([])
  })

  // ─── Missing Places API key ────────────────────────────────────────────────

  it('missing Places API key → 503, nested error envelope', async () => {
    mockGetApiKeys.mockReturnValue({ places: undefined, gemini: 'AItest123456789012345678901234567890' })
    const res = await POST(makeReq({ placeId: 'place-abc' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ message: expect.any(String), code: 'PLACES_SERVICE_UNAVAILABLE' })
    expect(typeof body.error).toBe('object')
  })

  // ─── Missing Gemini API key ────────────────────────────────────────────────

  it('missing Gemini key → 503, code: SCAN_SERVICE_UNAVAILABLE, nested envelope', async () => {
    mockGetApiKeys.mockReturnValue({ places: 'places-test-key', gemini: undefined })
    const res = await POST(makeReq({ placeId: 'place-abc' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'SCAN_SERVICE_UNAVAILABLE' })
  })

  // ─── Invalid JSON ──────────────────────────────────────────────────────────

  it('invalid JSON body → 400, code: INVALID_REQUEST, nested envelope', async () => {
    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  // ─── Zod validation failure ────────────────────────────────────────────────

  it('missing placeId → 422, code: VALIDATION_ERROR, nested envelope', async () => {
    const res = await POST(makeReq({ restaurantName: 'Some Restaurant' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('empty placeId → 422, code: VALIDATION_ERROR', async () => {
    const res = await POST(makeReq({ placeId: '' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  // ─── P7: NO_PHOTOS ────────────────────────────────────────────────────────

  it('fewer than 2 photos → 503, code: NO_PHOTOS, nested envelope', async () => {
    mockGetRestaurantPhotos.mockResolvedValue(['https://photos.example.com/only-one.jpg'])
    const res = await POST(makeReq({ placeId: 'place-abc' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'NO_PHOTOS' })
  })

  // ─── P7: SCAN_UNAVAILABLE ─────────────────────────────────────────────────

  it('all Gemini classification batches fail → 503, code: SCAN_UNAVAILABLE, nested envelope', async () => {
    const photoUrls = [
      'https://photos.example.com/a.jpg',
      'https://photos.example.com/b.jpg',
    ]
    mockGetRestaurantPhotos.mockResolvedValue(photoUrls)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue('image/jpeg') },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('fakejpeg').buffer),
    })
    // Gemini throws on every call → all batches fail
    mockGenerateContent.mockRejectedValue(new Error('Gemini unavailable'))

    const res = await POST(makeReq({ placeId: 'place-abc' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'SCAN_UNAVAILABLE' })
  })

  // ─── D9: cache hit ────────────────────────────────────────────────────────

  it('cache hit → { data: { dishes, fromCache: true } }', async () => {
    mockGetCachedMenu.mockResolvedValue({
      dishes: [
        { name: 'Burger', description: 'A beef burger', calorieEstimate: 700 },
        { name: 'Fries', description: 'Crispy fries', calorieEstimate: 350 },
      ],
    })
    const res = await POST(makeReq({ placeId: 'place-abc', restaurantName: 'Burger Joint' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.fromCache).toBe(true)
    expect(body.data.dishes).toHaveLength(2)
    expect(body.data.dishes[0].name).toBe('Burger')
    // Places photos and Gemini should never be called on a cache hit
    expect(mockGetRestaurantPhotos).not.toHaveBeenCalled()
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  // ─── P6: success (full scan flow) ─────────────────────────────────────────

  it('success full flow → { data: { dishes, menuPhotoUrl, dishPhotos } } — data wrapper', async () => {
    const photoUrls = [
      'https://photos.example.com/menu.jpg',
      'https://photos.example.com/dish.jpg',
    ]
    mockGetRestaurantPhotos.mockResolvedValue(photoUrls)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue('image/jpeg') },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('fakejpeg').buffer),
    })

    // First Gemini call: classification → index 0 is menu, index 1 is a dish
    mockGenerateContent
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              menuIndices: [0],
              dishPhotos: [{ index: 1, name: 'Pasta' }],
            }),
        },
      })
      // Second Gemini call: menu scan → returns dishes
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              type: 'menu',
              restaurantName: 'Test Restaurant',
              dishes: [
                {
                  name: 'Pasta',
                  description: 'Delicious pasta',
                  calorieEstimate: 500,
                  confidence: 0.9,
                  ingredients: [],
                },
              ],
            }),
        },
      })

    const res = await POST(makeReq({ placeId: 'place-abc', restaurantName: 'Test Restaurant' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.dishes).toHaveLength(1)
    expect(body.data.dishes[0].name).toBe('Pasta')
    expect(body.data.menuPhotoUrl).toBe('https://photos.example.com/menu.jpg')
    expect(body.data.fromCache).toBeUndefined()
    // Bare fields must not leak to top level
    expect(body.dishes).toBeUndefined()
  })
})
