import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { getApiKeys } from '@/lib/api-keys'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: 'test-gemini-key', places: null, usda: 'test-usda-key' })),
}))

const mockGenerateContent = vi.fn()
vi.mock('@google/generative-ai', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  GoogleGenerativeAI: vi.fn().mockImplementation(function (this: any) {
    this.getGenerativeModel = () => ({ generateContent: mockGenerateContent })
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRequest(params?: { restaurantId?: string; name?: string }) {
  const url = new URL('http://localhost/api/search/dishes')
  if (params?.restaurantId) url.searchParams.set('restaurantId', params.restaurantId)
  if (params?.name) url.searchParams.set('name', params.name)
  return new Request(url.toString())
}

const GEMINI_DISH_JSON = {
  name: 'Grilled Salmon',
  description: 'Perfectly grilled salmon fillet',
  calorieEstimate: 420,
  ingredients: [
    { name: 'Salmon', quantity: '200', unit: 'g', confidenceLevel: 'high' },
    { name: 'Olive oil', quantity: '1', unit: 'tbsp', confidenceLevel: 'medium' },
  ],
  imageUrl: null,
}

const USDA_SUCCESS_RESPONSE = {
  foods: [{ fdcId: 123, description: 'Salmon, raw', foodNutrients: [] }],
  totalHits: 1,
}

describe('GET /api/search/dishes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 503 when Gemini API key is not configured', async () => {
    vi.mocked(getApiKeys).mockReturnValueOnce({ gemini: null, places: null, usda: 'test-usda-key' })
    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Salmon' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('DISH_LOOKUP_UNAVAILABLE')
  })

  it('returns 400 when restaurantId param is missing', async () => {
    const res = await GET(makeRequest({ name: 'Salmon' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when name param is missing', async () => {
    const res = await GET(makeRequest({ restaurantId: 'place-123' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when both params are missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when name param is whitespace only', async () => {
    const res = await GET(makeRequest({ restaurantId: 'place-123', name: '   ' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 200 with correct SearchDishResponse shape when USDA succeeds', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(GEMINI_DISH_JSON) },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => USDA_SUCCESS_RESPONSE,
    })

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.nutritionAvailable).toBe(true)
    expect(body.data.dish.name).toBe('Grilled Salmon')
    expect(body.data.dish.description).toBe('Perfectly grilled salmon fillet')
    expect(body.data.dish.calorieEstimate).toBe(420)
    expect(body.data.dish.imageUrl).toBeNull()
    expect(body.data.dish.ingredients).toHaveLength(2)
    expect(body.data.dish.ingredients[0].name).toBe('Salmon')
  })

  it('returns nutritionAvailable: false when USDA call fails', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(GEMINI_DISH_JSON) },
    })
    mockFetch.mockRejectedValueOnce(new Error('USDA network error'))

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.nutritionAvailable).toBe(false)
    expect(body.data.dish.name).toBe('Grilled Salmon')
  })

  it('returns nutritionAvailable: false when USDA returns no results', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(GEMINI_DISH_JSON) },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ foods: [], totalHits: 0 }),
    })

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.nutritionAvailable).toBe(false)
  })

  it('returns nutritionAvailable: false without USDA call when first ingredient is Unknown', async () => {
    const dishWithUnknownIngredient = {
      ...GEMINI_DISH_JSON,
      ingredients: [
        { name: 123, quantity: null, unit: null, confidenceLevel: 'low' }, // non-string → defaults to 'Unknown'
        ...GEMINI_DISH_JSON.ingredients.slice(1),
      ],
    }
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(dishWithUnknownIngredient) },
    })
    // mockFetch should NOT be called for USDA

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.nutritionAvailable).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns nutritionAvailable: false when USDA returns non-ok response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(GEMINI_DISH_JSON) },
    })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.nutritionAvailable).toBe(false)
  })

  it('returns 503 with DISH_LOOKUP_UNAVAILABLE when Gemini fails', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini down'))

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('Dish lookup unavailable')
    expect(body.code).toBe('DISH_LOOKUP_UNAVAILABLE')
  })

  it('returns 503 when Gemini returns invalid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'not valid json at all' },
    })

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('DISH_LOOKUP_UNAVAILABLE')
  })

  it('handles Gemini response wrapped in markdown fences', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () =>
          '```json\n' + JSON.stringify(GEMINI_DISH_JSON) + '\n```',
      },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => USDA_SUCCESS_RESPONSE,
    })

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dish.name).toBe('Grilled Salmon')
  })

  it('sets imageUrl to null on dish result (search-generated recipes have no image)', async () => {
    const dishWithImage = { ...GEMINI_DISH_JSON, imageUrl: 'https://example.com/img.jpg' }
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(dishWithImage) },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => USDA_SUCCESS_RESPONSE,
    })

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'Grilled Salmon' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // imageUrl is always null for search-generated recipes
    expect(body.data.dish.imageUrl).toBeNull()
  })

  it('does not expose API key in error response', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('test-gemini-key exposed'))

    const res = await GET(makeRequest({ restaurantId: 'place-123', name: 'test' }))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('test-gemini-key')
  })
})
