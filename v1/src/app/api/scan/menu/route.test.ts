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
  return new Request('http://localhost/api/scan/menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/scan/menu', () => {
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
    const req = new Request('http://localhost/api/scan/menu', {
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
    vi.mocked(getApiKeys).mockReturnValueOnce({ gemini: undefined, places: undefined, usda: undefined })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('SCAN_SERVICE_UNAVAILABLE')
  })

  it('returns 200 with dishes on valid Gemini response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [
            { name: 'Duck Confit', description: 'Crispy duck leg', calorieEstimate: 650 }
          ]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.type).toBe('menu')
    expect(body.data.confidenceSource).toBe('gemini-only')
    expect(body.data.scanId).toBeTypeOf('string')
    expect(body.data.dishes[0].name).toBe('Duck Confit')
    expect(body.data.dishes[0].imageUrl).toBeNull()
    expect(body.data.dishes[0].ingredients).toEqual([])
    expect(body.data.dishes[0].calorieEstimate).toBe(650)
  })

  it('returns dishes with null calorieEstimate when not provided', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{ name: 'Salad', description: '', calorieEstimate: null }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].calorieEstimate).toBeNull()
  })

  it('returns 503 when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Service down'))
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('SCAN_UNAVAILABLE')
  })

  it('handles Gemini response wrapped in markdown fences', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n{"dishes":[{"name":"Steak Frites","description":"","calorieEstimate":null}]}\n```'
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].name).toBe('Steak Frites')
  })

  it('returns 422 when Gemini returns invalid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'not valid json at all' }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('GEMINI_RESPONSE_UNPARSEABLE')
  })

  it('returns 400 when mimeType is not a supported image format', async () => {
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'application/pdf' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when imageBase64 exceeds size limit', async () => {
    const oversized = 'a'.repeat(10 * 1024 * 1024 + 1)
    const res = await POST(makeRequest({ imageBase64: oversized, mimeType: 'image/jpeg' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_REQUEST')
  })

  it('returns null calorieEstimate when Gemini returns NaN or Infinity', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{ name: 'Soup', description: '', calorieEstimate: null }]
        }).replace('"calorieEstimate":null', '"calorieEstimate":1e999')
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // JSON.parse of 1e999 yields Infinity — should be clamped to null
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

  it('sets totalDishCount when Gemini returns totalDishesOnMenu > dishes identified', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          totalDishesOnMenu: 5,
          dishes: [
            { name: 'Duck Confit', description: 'Crispy duck leg', calorieEstimate: 650 },
            { name: 'Risotto', description: 'Creamy risotto', calorieEstimate: 500 },
          ]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.totalDishCount).toBe(5)
    expect(body.data.dishes).toHaveLength(2)
  })

  it('omits totalDishCount when totalDishesOnMenu equals dishes identified', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          totalDishesOnMenu: 2,
          dishes: [
            { name: 'Duck Confit', description: '', calorieEstimate: null },
            { name: 'Risotto', description: '', calorieEstimate: null },
          ]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.totalDishCount).toBeUndefined()
  })

  it('includes emptyReason in response when dishes is empty and emptyReason is not_menu', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({ totalDishesOnMenu: 0, emptyReason: 'not_menu', dishes: [] })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes).toHaveLength(0)
    expect(body.data.emptyReason).toBe('not_menu')
  })

  it('includes emptyReason image_quality in response when dishes is empty', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({ totalDishesOnMenu: 0, emptyReason: 'image_quality', dishes: [] })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.emptyReason).toBe('image_quality')
  })

  it('omits emptyReason from response when dishes array is non-empty', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          emptyReason: 'not_menu',
          dishes: [{ name: 'Tacos', description: '', calorieEstimate: null }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.emptyReason).toBeUndefined()
  })

  it('omits emptyReason from response when dishes is empty but emptyReason value is unrecognised', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({ totalDishesOnMenu: 0, emptyReason: 'UNKNOWN_REASON', dishes: [] })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.emptyReason).toBeUndefined()
  })

  it('omits totalDishCount when Gemini response missing totalDishesOnMenu', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [{ name: 'Salad', description: '', calorieEstimate: null }]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.totalDishCount).toBeUndefined()
  })
})
