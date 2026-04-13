import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// vi.hoisted ensures these are available when vi.mock factories run (which are
// hoisted to the top of the module by Vitest at transform time).
const { mockGenerateContent, MockGoogleGenerativeAI, mockGetGenerativeModel } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }))
  // Must use a regular function (not arrow) so vi.fn() supports 'new GoogleGenerativeAI(...)'
  const MockGoogleGenerativeAI = vi.fn(function MockGoogleGenerativeAI() {
    return { getGenerativeModel: mockGetGenerativeModel }
  })
  return { mockGenerateContent, MockGoogleGenerativeAI, mockGetGenerativeModel }
})

const mockGetApiKeys = vi.hoisted(() => vi.fn(() => ({ gemini: 'AItest123456789012345678901234567890' })))
const mockGetCachedMenu = vi.hoisted(() => vi.fn().mockResolvedValue(null))
const mockCacheMenu = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: MockGoogleGenerativeAI,
}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: mockGetApiKeys,
}))

vi.mock('@/lib/menuCache', () => ({
  getCachedMenu: mockGetCachedMenu,
  cacheMenu: mockCacheMenu,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

// Import after mocks are set up
import { POST } from './route'

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/scan', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function geminiSuccessResponse(overrides?: {
  restaurantName?: string | null
  dishes?: Array<{ name: string; description: string; confidence?: number; ingredients?: unknown[] }>
}) {
  const payload = {
    type: 'menu',
    restaurantName: overrides?.restaurantName ?? 'Test Restaurant',
    dishes: overrides?.dishes ?? [
      { name: 'Margherita Pizza', description: 'Classic tomato and mozzarella', confidence: 0.95, ingredients: [] },
    ],
  }
  return { response: { text: () => JSON.stringify(payload) } }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({ gemini: 'AItest123456789012345678901234567890' })
    mockGetCachedMenu.mockResolvedValue(null)
    mockCacheMenu.mockResolvedValue(undefined)
    mockGenerateContent.mockResolvedValue(geminiSuccessResponse())
    // Reset to one-model-per-call
    mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent })
  })

  // ─── Validation ─────────────────────────────────────────────────────────────

  describe('validation', () => {
    it('missing imageBase64 and photoUrl → 422, code: VALIDATION_ERROR', async () => {
      const req = makeReq({ mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('imageBase64 present but no mimeType → 422, code: VALIDATION_ERROR', async () => {
      const req = makeReq({ imageBase64: 'abc123' })
      const res = await POST(req)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('invalid JSON body → 400, code: INVALID_REQUEST', async () => {
      const req = new NextRequest('http://localhost/api/scan', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('INVALID_REQUEST')
    })
  })

  // ─── BYOAK ──────────────────────────────────────────────────────────────────

  describe('BYOAK', () => {
    it('valid X-User-Gemini-Key (starts "AI", ≥39 chars) → used for Gemini call', async () => {
      const userKey = 'AI' + 'x'.repeat(37) // exactly 39 chars
      const req = makeReq(
        { imageBase64: 'base64data', mimeType: 'image/jpeg' },
        { 'X-User-Gemini-Key': userKey }
      )
      await POST(req)
      expect(MockGoogleGenerativeAI).toHaveBeenCalledWith(userKey)
    })

    it('invalid key (too short) → falls back to system key', async () => {
      const systemKey = 'AItest123456789012345678901234567890'
      mockGetApiKeys.mockReturnValue({ gemini: systemKey })
      const req = makeReq(
        { imageBase64: 'base64data', mimeType: 'image/jpeg' },
        { 'X-User-Gemini-Key': 'AIshort' } // < 39 chars
      )
      await POST(req)
      expect(MockGoogleGenerativeAI).toHaveBeenCalledWith(systemKey)
    })
  })

  // ─── Gemini success ──────────────────────────────────────────────────────────

  describe('Gemini success', () => {
    it('valid menu image → 200, data.dishes array with name+description', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiSuccessResponse({
          dishes: [
            { name: 'Burger', description: 'Juicy beef burger', confidence: 0.9, ingredients: [] },
            { name: 'Fries', description: 'Crispy golden fries', confidence: 0.85, ingredients: [] },
          ],
        })
      )
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.data.dishes)).toBe(true)
      expect(body.data.dishes.length).toBe(2)
      expect(body.data.dishes[0]).toMatchObject({ name: 'Burger', description: 'Juicy beef burger' })
      expect(body.data.dishes[1]).toMatchObject({ name: 'Fries', description: 'Crispy golden fries' })
    })

    it('restaurantName extracted → present in response data', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiSuccessResponse({ restaurantName: 'The Great Café' })
      )
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.restaurantName).toBe('The Great Café')
    })
  })

  // ─── totalDetected (AC1) ─────────────────────────────────────────────────────

  describe('totalDetected', () => {
    it('success response includes totalDetected in data', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiSuccessResponse({
          dishes: [
            { name: 'Burger', description: 'Beef burger', confidence: 0.9, ingredients: [] },
            { name: 'Fries', description: 'Golden fries', confidence: 0.85, ingredients: [] },
          ],
        })
      )
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(typeof body.data.totalDetected).toBe('number')
    })

    it('totalDetected >= dishes.length (cannot have more recognised than detected)', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiSuccessResponse({
          dishes: [
            { name: 'Burger', description: 'Beef burger', confidence: 0.9, ingredients: [] },
            { name: 'Fries', description: 'Golden fries', confidence: 0.85, ingredients: [] },
          ],
        })
      )
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      const body = await res.json()
      expect(body.data.totalDetected).toBeGreaterThanOrEqual(body.data.dishes.length)
    })

    it('empty-named dish is filtered from dishes but counted in totalDetected', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiSuccessResponse({
          dishes: [
            { name: '', description: 'nameless', confidence: 0.5, ingredients: [] },
            { name: 'Pasta', description: 'Al dente', confidence: 0.9, ingredients: [] },
          ],
        })
      )
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      // One dish returned, but two were detected (one had empty name)
      expect(body.data.dishes.length).toBe(1)
      expect(body.data.totalDetected).toBe(2)
    })

    it('all dishes empty name → 422 NO_DISHES (totalDetected is not in response)', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiSuccessResponse({
          dishes: [
            { name: '', description: 'nothing', confidence: 0.5, ingredients: [] },
          ],
        })
      )
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('NO_DISHES')
    })
  })

  // ─── Gemini fallback ─────────────────────────────────────────────────────────

  describe('Gemini fallback', () => {
    it('2.5 Flash throws 503 → 2.0 Flash called → 200', async () => {
      const successResult = geminiSuccessResponse()
      // First call (2.5 Flash) throws 503; second call (2.0 Flash) succeeds
      mockGenerateContent
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce(successResult)

      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(200)
      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(2)
      expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(1, { model: 'gemini-2.5-flash' })
      expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(2, { model: 'gemini-2.0-flash' })
    })

    it('both models fail → 503, code: AI_UNAVAILABLE', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))

      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error.code).toBe('AI_UNAVAILABLE')
    })
  })

  // ─── Response filtering ──────────────────────────────────────────────────────

  describe('response filtering', () => {
    it('dishes with empty name → filtered out; valid dishes returned', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiSuccessResponse({
          dishes: [
            { name: '', description: 'nameless dish', confidence: 0.9, ingredients: [] },
            { name: 'Pasta', description: 'Al dente spaghetti', confidence: 0.9, ingredients: [] },
          ],
        })
      )
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.dishes.length).toBe(1)
      expect(body.data.dishes[0].name).toBe('Pasta')
    })

    it('all dishes empty name → 422, code: NO_DISHES', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiSuccessResponse({
          dishes: [
            { name: '', description: 'nothing here', confidence: 0.5, ingredients: [] },
            { name: '   ', description: 'whitespace only', confidence: 0.5, ingredients: [] },
          ],
        })
      )
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('NO_DISHES')
    })
  })

  // ─── Menu cache ───────────────────────────────────────────────────────────────

  describe('menu cache', () => {
    it('cache hit → Gemini NOT called; cached dishes returned with HTTP 200', async () => {
      mockGetCachedMenu.mockResolvedValue({
        dishes: [
          { name: 'Cached Burger', description: 'From cache', calorieEstimate: 500 },
        ],
      })

      const req = makeReq({
        imageBase64: 'base64data',
        mimeType: 'image/jpeg',
        restaurantName: 'Cached Restaurant',
      })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.cached).toBe(true)
      expect(body.data.dishes[0].name).toBe('Cached Burger')
      // Gemini was not called
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })
  })

  // ─── API key ──────────────────────────────────────────────────────────────────

  describe('API key', () => {
    it('no API key configured → 503, code: SCAN_SERVICE_UNAVAILABLE', async () => {
      mockGetApiKeys.mockReturnValue({ gemini: undefined })
      const req = makeReq({ imageBase64: 'base64data', mimeType: 'image/jpeg' })
      const res = await POST(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error.code).toBe('SCAN_SERVICE_UNAVAILABLE')
    })
  })

  // ─── photoUrl path ────────────────────────────────────────────────────────────

  describe('photoUrl path', () => {
    let originalFetch: typeof global.fetch

    beforeEach(() => {
      originalFetch = global.fetch
      global.fetch = vi.fn()
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('non-HTTPS photoUrl → 400, code: INVALID_REQUEST', async () => {
      const req = makeReq({ photoUrl: 'http://example.com/menu.jpg' })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('INVALID_REQUEST')
    })

    it('photoUrl fetch returns non-2xx → 400, code: PHOTO_FETCH_FAILED', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('image/jpeg') },
      })
      const req = makeReq({ photoUrl: 'https://example.com/missing.jpg' })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('PHOTO_FETCH_FAILED')
    })

    it('photoUrl fetch throws (network error) → 400, code: PHOTO_FETCH_FAILED', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'))
      const req = makeReq({ photoUrl: 'https://example.com/menu.jpg' })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('PHOTO_FETCH_FAILED')
    })

    it('valid HTTPS photoUrl → 200 with dishes', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('image/jpeg') },
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      })
      const req = makeReq({ photoUrl: 'https://example.com/menu.jpg' })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.data.dishes)).toBe(true)
    })
  })
})
