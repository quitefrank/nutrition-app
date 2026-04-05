import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { getApiKeys } from '@/lib/api-keys'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: null, places: 'test-places-key', usda: null })),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRequest(query?: string) {
  const url = query
    ? `http://localhost/api/search/restaurants?q=${encodeURIComponent(query)}`
    : 'http://localhost/api/search/restaurants'
  return new Request(url)
}

const PLACES_RESPONSE = {
  places: [
    {
      id: 'place-id-1',
      displayName: { text: 'The Great Burger' },
      formattedAddress: '123 Main St, New York, NY',
    },
    {
      id: 'place-id-2',
      displayName: { text: 'Pizza Palace' },
      formattedAddress: '456 Broadway, New York, NY',
    },
  ],
}

describe('GET /api/search/restaurants', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 503 when Places API key is not configured', async () => {
    vi.mocked(getApiKeys).mockReturnValueOnce({ gemini: null, places: null, usda: null })
    const res = await GET(makeRequest('burger'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('PLACES_UNAVAILABLE')
  })

  it('returns 400 when q param is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when q param is empty string', async () => {
    const res = await GET(makeRequest(''))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when q param is whitespace only', async () => {
    const res = await GET(makeRequest('   '))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 200 with correct RestaurantSearchResult shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PLACES_RESPONSE,
    })

    const res = await GET(makeRequest('burger'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)

    const first = body.data[0]
    expect(first.googlePlacesId).toBe('place-id-1')
    expect(first.name).toBe('The Great Burger')
    expect(first.address).toBe('123 Main St, New York, NY')
    expect(first.imageUrl).toBeNull() // photo proxy deferred to story 5.2

    expect(body.data[1].imageUrl).toBeNull()
  })

  it('returns 503 with PLACES_UNAVAILABLE when Places API call fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const res = await GET(makeRequest('sushi'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('Restaurant search unavailable')
    expect(body.code).toBe('PLACES_UNAVAILABLE')
  })

  it('returns 503 when Places API returns a non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    })

    const res = await GET(makeRequest('tacos'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('PLACES_UNAVAILABLE')
  })

  it('returns empty data array when Places returns no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ places: [] }),
    })

    const res = await GET(makeRequest('xyzzy'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('handles Places response with missing places key gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    const res = await GET(makeRequest('pizza'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('does not expose API key in error response', async () => {
    mockFetch.mockRejectedValueOnce(new Error('test-places-key exposed'))

    const res = await GET(makeRequest('burger'))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('test-places-key')
  })

  it('does not expose API key in success response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => PLACES_RESPONSE,
    })

    const res = await GET(makeRequest('burger'))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('test-places-key')
  })
})
