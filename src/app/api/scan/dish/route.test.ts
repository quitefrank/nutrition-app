import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: 'test-key', places: null, usda: null })),
}))

const mockGenerateContent = vi.fn()
vi.mock('@google/generative-ai', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  GoogleGenerativeAI: vi.fn().mockImplementation(function (this: any) {
    this.getGenerativeModel = () => ({ generateContent: mockGenerateContent })
  }),
}))

function makeRequest(body: object) {
  return new Request('http://localhost/api/scan/dish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/scan/dish', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when imageBase64 is missing', async () => {
    const res = await POST(makeRequest({ mimeType: 'image/jpeg' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when mimeType is missing', async () => {
    const res = await POST(makeRequest({ imageBase64: 'abc' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when body is not valid JSON', async () => {
    const req = new Request('http://localhost/api/scan/dish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns 503 when Gemini key is not configured', async () => {
    const { getApiKeys } = await import('@/lib/api-keys')
    vi.mocked(getApiKeys).mockReturnValueOnce({ gemini: undefined, places: null, usda: null })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('SCAN_SERVICE_UNAVAILABLE')
  })

  it('returns 200 with dish and ingredients on valid Gemini response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [
            {
              name: 'Grilled Salmon',
              description: 'Salmon fillet with herbs',
              calorieEstimate: 420,
              ingredients: [
                { name: 'Salmon', quantity: '200', unit: 'g', confidenceLevel: 'high' },
                { name: 'Olive oil', quantity: '1', unit: 'tbsp', confidenceLevel: 'medium' },
              ]
            }
          ]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.type).toBe('dish')
    expect(body.data.confidenceSource).toBe('gemini-only')
    expect(body.data.scanId).toBeTypeOf('string')
    expect(body.data.dishes).toHaveLength(1)
    expect(body.data.dishes[0].name).toBe('Grilled Salmon')
    expect(body.data.dishes[0].imageUrl).toBeNull()
    expect(body.data.dishes[0].calorieEstimate).toBe(420)
    expect(body.data.dishes[0].ingredients).toHaveLength(2)
    expect(body.data.dishes[0].ingredients[0].name).toBe('Salmon')
    expect(body.data.dishes[0].ingredients[0].confidenceLevel).toBe('high')
  })

  it('defaults confidenceLevel to "low" when invalid value received', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{
            name: 'Pasta',
            description: 'Pasta dish',
            calorieEstimate: null,
            ingredients: [
              { name: 'Pasta', quantity: null, unit: null, confidenceLevel: 'unknown-level' },
            ]
          }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].ingredients[0].confidenceLevel).toBe('low')
  })

  it('returns empty ingredients array when ingredients field is missing', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{ name: 'Mystery dish', description: '', calorieEstimate: null }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].ingredients).toEqual([])
  })

  it('returns 503 when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Service down'))
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('SCAN_SERVICE_UNAVAILABLE')
  })

  it('handles Gemini response wrapped in markdown fences', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n{"dishes":[{"name":"Tacos","description":"","calorieEstimate":null,"ingredients":[]}]}\n```'
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].name).toBe('Tacos')
  })

  it('returns 422 when Gemini returns invalid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'not valid json' }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('GEMINI_RESPONSE_UNPARSEABLE')
  })

  it('returns 400 when mimeType is not a supported image format', async () => {
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'text/html' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when imageBase64 exceeds size limit', async () => {
    const oversized = 'a'.repeat(10 * 1024 * 1024 + 1)
    const res = await POST(makeRequest({ imageBase64: oversized, mimeType: 'image/jpeg' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns null calorieEstimate when Gemini returns negative value', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{
            name: 'Steak',
            description: '',
            calorieEstimate: -50,
            ingredients: []
          }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].calorieEstimate).toBeNull()
  })

  it('returns 500 INTERNAL_ERROR on unexpected non-Gemini exception', async () => {
    const { getApiKeys } = await import('@/lib/api-keys')
    vi.mocked(getApiKeys).mockImplementationOnce(() => { throw new TypeError('Unexpected') })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('INTERNAL_ERROR')
  })

  it('does not expose API key in error response', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('test-key exposed'))
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('test-key')
  })

  it('sets confidenceSource to "inference" when >60% of ingredients are low confidence', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{
            name: 'Mystery Dish',
            description: 'Hard to identify',
            calorieEstimate: null,
            ingredients: [
              { name: 'Ingredient 1', quantity: null, unit: null, confidenceLevel: 'low' },
              { name: 'Ingredient 2', quantity: null, unit: null, confidenceLevel: 'low' },
              { name: 'Ingredient 3', quantity: null, unit: null, confidenceLevel: 'low' },
              { name: 'Ingredient 4', quantity: null, unit: null, confidenceLevel: 'high' },
            ]
          }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // 3 of 4 ingredients are low (75%) — above 60% threshold
    expect(body.data.confidenceSource).toBe('inference')
  })

  it('keeps confidenceSource as "gemini-only" when <=60% of ingredients are low confidence', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{
            name: 'Grilled Chicken',
            description: 'Well-lit dish',
            calorieEstimate: 350,
            ingredients: [
              { name: 'Chicken', quantity: '200', unit: 'g', confidenceLevel: 'high' },
              { name: 'Olive oil', quantity: '1', unit: 'tbsp', confidenceLevel: 'high' },
              { name: 'Herbs', quantity: null, unit: null, confidenceLevel: 'low' },
            ]
          }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // 1 of 3 ingredients are low (33%) — below 60% threshold
    expect(body.data.confidenceSource).toBe('gemini-only')
  })

  it('keeps confidenceSource as "gemini-only" when there are no ingredients', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{ name: 'Empty dish', description: '', calorieEstimate: null, ingredients: [] }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.confidenceSource).toBe('gemini-only')
  })

  it('keeps confidenceSource as "gemini-only" at exactly 60% low (strictly >60% required)', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{
            name: 'Boundary Dish',
            description: '',
            calorieEstimate: null,
            ingredients: [
              { name: 'Ingredient 1', quantity: null, unit: null, confidenceLevel: 'low' },
              { name: 'Ingredient 2', quantity: null, unit: null, confidenceLevel: 'low' },
              { name: 'Ingredient 3', quantity: null, unit: null, confidenceLevel: 'low' },
              { name: 'Ingredient 4', quantity: null, unit: null, confidenceLevel: 'high' },
              { name: 'Ingredient 5', quantity: null, unit: null, confidenceLevel: 'high' },
            ]
          }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // 3 of 5 ingredients are low (60%) — NOT strictly >60%, stays gemini-only
    expect(body.data.confidenceSource).toBe('gemini-only')
  })
})
