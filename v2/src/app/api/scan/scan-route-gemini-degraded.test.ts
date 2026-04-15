/**
 * /api/scan — Gemini degraded states (Story 6.5 AC1)
 *
 * Covers every Gemini failure path: transient errors, non-transient errors,
 * response parsing failures, and the outer-try INTERNAL_ERROR safety net.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockGenerateContent, MockGoogleGenAI } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  // Must be a regular function (not arrow) so vi.fn() supports `new GoogleGenAI(...)`
  const MockGoogleGenAI = vi.fn(function MockGoogleGenAI() {
    return { models: { generateContent: mockGenerateContent } }
  })
  return { mockGenerateContent, MockGoogleGenAI }
})

const mockGetApiKeys = vi.hoisted(() =>
  vi.fn(() => ({ gemini: 'AItest123456789012345678901234567890' }))
)
const mockGetCachedMenu = vi.hoisted(() => vi.fn().mockResolvedValue(null))
const mockCacheMenu = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@google/genai', () => ({
  GoogleGenAI: MockGoogleGenAI,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/scan', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function geminiSuccessResponse() {
  return {
    text: JSON.stringify({
      type: 'menu',
      restaurantName: 'Test Bistro',
      dishes: [
        { name: 'Pasta', description: 'Al dente', confidence: 0.9, ingredients: [] },
        { name: 'Risotto', description: 'Creamy mushroom risotto', confidence: 0.85, ingredients: [] },
      ],
    }),
  }
}

const BASE_REQ_BODY = { imageBase64: 'base64data', mimeType: 'image/jpeg' }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/api/scan — Gemini degraded states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({ gemini: 'AItest123456789012345678901234567890' })
    mockGetCachedMenu.mockResolvedValue(null)
    mockCacheMenu.mockResolvedValue(undefined)
  })

  it('returns AI_UNAVAILABLE 503 when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('503 Service Unavailable'))

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('AI_UNAVAILABLE')
  })

  it('returns AI_UNAVAILABLE 503 on quota error', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('429 Too Many Requests quota exceeded'))

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('AI_UNAVAILABLE')
  })

  it('returns AI_UNAVAILABLE 503 on overloaded error', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('The model is overloaded. Please try again later.'))

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('AI_UNAVAILABLE')
  })

  it('returns AI_UNAVAILABLE 503 on 400 bad request', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('400 Bad Request: invalid content'))

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('AI_UNAVAILABLE')
  })

  it('returns GEMINI_RESPONSE_UNPARSEABLE 422 when Gemini returns malformed JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'this is definitely not valid json {{{',
    })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('GEMINI_RESPONSE_UNPARSEABLE')
  })

  it('returns GEMINI_RESPONSE_INVALID 422 when Gemini returns valid JSON but wrong schema', async () => {
    // JSON.parse('42') → 42 (a number) — z.object() rejects a non-object even with .catch() on fields
    mockGenerateContent.mockResolvedValueOnce({ text: '42' })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('GEMINI_RESPONSE_INVALID')
  })

  it('returns NO_DISHES 422 when all dishes have empty names', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        type: 'menu',
        restaurantName: null,
        dishes: [
          { name: '', description: 'no name', confidence: 0.5, ingredients: [] },
          { name: '   ', description: 'whitespace', confidence: 0.5, ingredients: [] },
        ],
      }),
    })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('NO_DISHES')
  })

  it('returns SCAN_SERVICE_UNAVAILABLE 503 when no Gemini API key is configured', async () => {
    mockGetApiKeys.mockReturnValueOnce({ gemini: undefined as unknown as string })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('SCAN_SERVICE_UNAVAILABLE')
    // Gemini was never called
    expect(MockGoogleGenAI).not.toHaveBeenCalled()
  })

  it('outer try/catch returns INTERNAL_ERROR 500 on unexpected throws', async () => {
    // getApiKeys() is called at the top of POST, outside all inner try/catch guards.
    // If it throws unexpectedly, the outer catch fires → INTERNAL_ERROR 500.
    mockGetApiKeys.mockImplementationOnce(() => {
      throw new Error('Unexpected runtime error in getApiKeys')
    })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('Gemini succeeds → 200 with dishes', async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiSuccessResponse())

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data.dishes)).toBe(true)
    expect(body.data.dishes[0].name).toBe('Pasta')
  })
})
