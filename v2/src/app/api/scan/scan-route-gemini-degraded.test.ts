/**
 * /api/scan — Gemini degraded states (Story 6.5 AC1)
 *
 * Augments route.test.ts with coverage of every Gemini failure path:
 * transient fallbacks (503, 429, overloaded), non-transient errors, response
 * parsing failures, and the outer-try INTERNAL_ERROR safety net.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockGenerateContent, MockGoogleGenerativeAI, mockGetGenerativeModel } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }))
  // Must be a regular function (not arrow) so vi.fn() supports `new GoogleGenerativeAI(...)`
  const MockGoogleGenerativeAI = vi.fn(function MockGoogleGenerativeAI() {
    return { getGenerativeModel: mockGetGenerativeModel }
  })
  return { mockGenerateContent, MockGoogleGenerativeAI, mockGetGenerativeModel }
})

const mockGetApiKeys = vi.hoisted(() =>
  vi.fn(() => ({ gemini: 'AItest123456789012345678901234567890' }))
)
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
    response: {
      text: () => JSON.stringify({
        type: 'menu',
        restaurantName: 'Test Bistro',
        dishes: [{ name: 'Pasta', description: 'Al dente', confidence: 0.9, ingredients: [] }],
      }),
    },
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
    mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent })
  })

  it('returns AI_UNAVAILABLE 503 when both gemini-2.5-flash and gemini-2.0-flash fail', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('AI_UNAVAILABLE')
  })

  it('falls back to gemini-2.0-flash when primary fails with 503', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce(geminiSuccessResponse())

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(200)
    // Primary (2.5-flash) then fallback (2.0-flash)
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(2)
    expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(1, { model: 'gemini-2.5-flash' })
    expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(2, { model: 'gemini-2.0-flash' })
  })

  it('falls back to gemini-2.0-flash when primary fails with 429 (quota)', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('429 Too Many Requests quota exceeded'))
      .mockResolvedValueOnce(geminiSuccessResponse())

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(200)
    expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(2, { model: 'gemini-2.0-flash' })
  })

  it('falls back to gemini-2.0-flash when primary fails with "overloaded"', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('The model is overloaded. Please try again later.'))
      .mockResolvedValueOnce(geminiSuccessResponse())

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(200)
    expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(2, { model: 'gemini-2.0-flash' })
  })

  it('does NOT fall back to gemini-2.0-flash on 400 (bad request — non-transient)', async () => {
    // 400 does not include '503', '429', '500', 'overloaded', or 'quota'
    // → isTransient is false → primaryErr is re-thrown → caught by outer Gemini catch → AI_UNAVAILABLE
    mockGenerateContent.mockRejectedValueOnce(new Error('400 Bad Request: invalid content'))

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('AI_UNAVAILABLE')
    // Only one model call — no fallback attempted
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1)
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-2.5-flash' })
  })

  it('returns GEMINI_RESPONSE_UNPARSEABLE 422 when Gemini returns malformed JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'this is definitely not valid json {{{' },
    })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('GEMINI_RESPONSE_UNPARSEABLE')
  })

  it('returns GEMINI_RESPONSE_INVALID 422 when Gemini returns valid JSON but wrong schema', async () => {
    // JSON.parse('42') → 42 (a number) — z.object() rejects a non-object even with .catch() on fields
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => '42' },
    })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('GEMINI_RESPONSE_INVALID')
  })

  it('returns NO_DISHES 422 when all dishes have empty names', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          type: 'menu',
          restaurantName: null,
          dishes: [
            { name: '', description: 'no name', confidence: 0.5, ingredients: [] },
            { name: '   ', description: 'whitespace', confidence: 0.5, ingredients: [] },
          ],
        }),
      },
    })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('NO_DISHES')
  })

  it('returns SCAN_SERVICE_UNAVAILABLE 503 when no Gemini API key is configured', async () => {
    mockGetApiKeys.mockReturnValueOnce({ gemini: undefined })

    const res = await POST(makeReq(BASE_REQ_BODY))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('SCAN_SERVICE_UNAVAILABLE')
    // Gemini was never called
    expect(MockGoogleGenerativeAI).not.toHaveBeenCalled()
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
})
