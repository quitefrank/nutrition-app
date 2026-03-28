import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getApiKeys } from '@/lib/api-keys'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: 'test-gemini-key', places: null, usda: null })),
}))

const mockGenerateContent = vi.fn()
vi.mock('@google/generative-ai', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  GoogleGenerativeAI: vi.fn().mockImplementation(function (this: any) {
    this.getGenerativeModel = () => ({ generateContent: mockGenerateContent })
  }),
}))

// Deferred import so mocks are registered before the module is loaded
async function importGET() {
  const mod = await import('./route')
  return mod.GET
}

function makeRequestContext(googlePlacesId: string) {
  const req = new NextRequest('http://localhost/api/search/restaurants/test/dishes')
  return {
    req,
    context: { params: Promise.resolve({ googlePlacesId }) },
  }
}

const GEMINI_DISHES_JSON = {
  dishes: [
    {
      name: 'Shake Burger',
      description: 'Classic beef burger with special sauce',
      calorieEstimate: 580,
      ingredients: [],
      imageUrl: null,
    },
    {
      name: 'ShackMeister Ale',
      description: 'Craft beer brewed exclusively for Shake Shack',
      calorieEstimate: 200,
      ingredients: [],
      imageUrl: null,
    },
  ],
}

describe('GET /api/search/restaurants/[googlePlacesId]/dishes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when googlePlacesId is missing or empty', async () => {
    const GET = await importGET()
    const { req, context } = makeRequestContext('')
    const res = await GET(req, context)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 503 when Gemini API key is not configured', async () => {
    vi.mocked(getApiKeys).mockReturnValueOnce({ gemini: null, places: null, usda: null })
    const GET = await importGET()
    const { req, context } = makeRequestContext('ChIJN1t_tDeuEmsRUsoyG83frY4')
    const res = await GET(req, context)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('DISH_LIST_UNAVAILABLE')
  })

  it('returns 200 with correct { data: DishResult[] } shape on success', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(GEMINI_DISHES_JSON) },
    })
    const GET = await importGET()
    const { req, context } = makeRequestContext('ChIJN1t_tDeuEmsRUsoyG83frY4')
    const res = await GET(req, context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(2)

    const first = body.data[0]
    expect(first.name).toBe('Shake Burger')
    expect(first.description).toBe('Classic beef burger with special sauce')
    expect(first.calorieEstimate).toBe(580)
    expect(Array.isArray(first.ingredients)).toBe(true)
    expect(first.ingredients).toHaveLength(0)
    expect(first.imageUrl).toBeNull()
  })

  it('always returns imageUrl as null for all dishes', async () => {
    const dishesWithImages = {
      dishes: GEMINI_DISHES_JSON.dishes.map(d => ({ ...d, imageUrl: 'https://example.com/img.jpg' })),
    }
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(dishesWithImages) },
    })
    const GET = await importGET()
    const { req, context } = makeRequestContext('place-123')
    const res = await GET(req, context)
    const body = await res.json()
    for (const dish of body.data) {
      expect(dish.imageUrl).toBeNull()
    }
  })

  it('returns 503 with DISH_LIST_UNAVAILABLE when Gemini call fails', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini down'))
    const GET = await importGET()
    const { req, context } = makeRequestContext('place-123')
    const res = await GET(req, context)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('Dish list unavailable')
    expect(body.code).toBe('DISH_LIST_UNAVAILABLE')
  })

  it('returns 503 when Gemini returns invalid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'not valid json' },
    })
    const GET = await importGET()
    const { req, context } = makeRequestContext('place-123')
    const res = await GET(req, context)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('DISH_LIST_UNAVAILABLE')
  })

  it('handles Gemini response wrapped in markdown fences', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => '```json\n' + JSON.stringify(GEMINI_DISHES_JSON) + '\n```' },
    })
    const GET = await importGET()
    const { req, context } = makeRequestContext('place-123')
    const res = await GET(req, context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].name).toBe('Shake Burger')
  })

  it('returns 503 when Gemini returns object without dishes array', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ wrong: 'shape' }) },
    })
    const GET = await importGET()
    const { req, context } = makeRequestContext('place-123')
    const res = await GET(req, context)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('DISH_LIST_UNAVAILABLE')
  })

  it('does not expose API key in error response', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('test-gemini-key exposed'))
    const GET = await importGET()
    const { req, context } = makeRequestContext('place-123')
    const res = await GET(req, context)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('test-gemini-key')
  })
})
