import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: null, places: 'test-places-key', usda: 'test-usda-key' })),
}))

const PLACES_CDN_URL = 'https://lh3.googleusercontent.com/cdn-photo'

// URL-based fetch mock — returns appropriate responses for each external API
function makeFetchMock(opts: { placesOk?: boolean; usdaOk?: boolean } = {}) {
  const { placesOk = true, usdaOk = true } = opts
  return vi.fn().mockImplementation(async (url: string) => {
    if (url === 'https://places.googleapis.com/v1/places:searchText') {
      if (!placesOk) return { ok: false, json: async () => ({}) }
      return {
        ok: true,
        json: async () => ({ places: [{ photos: [{ name: 'places/test/photos/abc123' }] }] }),
      }
    }
    if (typeof url === 'string' && url.includes('/media')) {
      if (!placesOk) return { ok: false, json: async () => ({}) }
      return {
        ok: true,
        json: async () => ({ photoUri: PLACES_CDN_URL }),
      }
    }
    if (typeof url === 'string' && url.includes('api.nal.usda.gov')) {
      if (!usdaOk) return { ok: false, json: async () => ({}) }
      return {
        ok: true,
        json: async () => ({ foods: [{ description: 'duck leg, salt blend' }] }),
      }
    }
    return { ok: false, json: async () => ({}) }
  })
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/scan/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mockDishes = [
  {
    name: 'Duck Confit',
    ingredients: [
      { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' as const },
      { name: 'Salt blend', quantity: null, unit: null, confidenceLevel: 'low' as const },
    ],
  },
]

describe('POST /api/scan/enrich', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('happy path: both services succeed — imageUrl and confidence upgrades applied', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ placesOk: true, usdaOk: true }))
    const res = await POST(makeRequest({ scanId: 'test-scan-id', dishes: mockDishes }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.scanId).toBe('test-scan-id')
    expect(body.data.confidenceSource).toBe('multi-source')
    expect(body.data.dishes[0].imageUrl).toBe(PLACES_CDN_URL)
    // Salt blend (low) → upgraded to medium via USDA match
    expect(body.data.dishes[0].ingredients[1].confidenceLevel).toBe('medium')
    // Duck leg (high) → unchanged
    expect(body.data.dishes[0].ingredients[0].confidenceLevel).toBe('high')
    expect(body.error).toBeUndefined()
  })

  it('Places 503 → imageUrl null, USDA upgrades applied, no error shape returned', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ placesOk: false, usdaOk: true }))
    const res = await POST(makeRequest({ scanId: 'test-scan-id', dishes: mockDishes }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.error).toBeUndefined()
    expect(body.data.dishes[0].imageUrl).toBeNull()
    // USDA still applied upgrade
    expect(body.data.dishes[0].ingredients[1].confidenceLevel).toBe('medium')
  })

  it('USDA 503 → imageUrl from Places, original confidenceLevel values, no error shape returned', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ placesOk: true, usdaOk: false }))
    const res = await POST(makeRequest({ scanId: 'test-scan-id', dishes: mockDishes }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.error).toBeUndefined()
    expect(body.data.dishes[0].imageUrl).toBe(PLACES_CDN_URL)
    // Salt blend remains low (no USDA upgrade)
    expect(body.data.dishes[0].ingredients[1].confidenceLevel).toBe('low')
  })

  it('missing API keys → 503 error shape (no enrichment work done)', async () => {
    const { getApiKeys } = await import('@/lib/api-keys')
    vi.mocked(getApiKeys).mockReturnValueOnce({ gemini: null, places: undefined, usda: undefined })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const res = await POST(makeRequest({ scanId: 'test-scan-id', dishes: mockDishes }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('ENRICH_SERVICE_UNAVAILABLE')
    expect(body.error).toBeDefined()
    // Guard fires before enrichment — no external fetches made
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keys present but both services throw network errors → 200 with null imageUrl and original confidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const res = await POST(makeRequest({ scanId: 'test-scan-id', dishes: mockDishes }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.error).toBeUndefined()
    expect(body.data.dishes[0].imageUrl).toBeNull()
    // Both threw — no upgrades applied
    expect(body.data.dishes[0].ingredients[1].confidenceLevel).toBe('low')
  })

  it('returns 400 when scanId is missing', async () => {
    vi.stubGlobal('fetch', makeFetchMock())
    const res = await POST(makeRequest({ dishes: mockDishes }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when scanId is not a string', async () => {
    vi.stubGlobal('fetch', makeFetchMock())
    const res = await POST(makeRequest({ scanId: 123, dishes: mockDishes }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when dishes is an empty array', async () => {
    vi.stubGlobal('fetch', makeFetchMock())
    const res = await POST(makeRequest({ scanId: 'test-scan-id', dishes: [] }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when a dish has a non-string name', async () => {
    vi.stubGlobal('fetch', makeFetchMock())
    const res = await POST(makeRequest({ scanId: 'test-scan-id', dishes: [{ name: 42, ingredients: [] }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when body is invalid JSON', async () => {
    const req = new Request('http://localhost/api/scan/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('does not expose API key in response body', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ placesOk: true, usdaOk: true }))
    const res = await POST(makeRequest({ scanId: 'test-scan-id', dishes: mockDishes }))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('test-places-key')
    expect(JSON.stringify(body)).not.toContain('test-usda-key')
  })
})
