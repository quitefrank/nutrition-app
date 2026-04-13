import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() =>
  vi.fn(() => ({ gemini: 'AItest123456789012345678901234567890' as string | undefined }))
)

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
vi.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: MockGoogleGenerativeAI }))

global.fetch = vi.fn()

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/import', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function geminiRecipeResponse(name: string, ingredients: unknown[] = []) {
  return {
    response: {
      text: () =>
        JSON.stringify({
          name,
          description: 'A test recipe',
          calorieEstimate: 400,
          servings: 2,
          ingredients,
        }),
    },
  }
}

function htmlFetchResponse(html: string) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(html),
  }
}

const RECIPE_HTML = '<html><body><h1>Spaghetti Carbonara</h1><p>Delicious pasta with eggs, bacon, and cheese. Use 200g pasta, 100g bacon, 3 eggs, 50g parmesan cheese.</p></body></html>'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({ gemini: 'AItest123456789012345678901234567890' })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(htmlFetchResponse(RECIPE_HTML))
    mockGenerateContent.mockResolvedValue(
      geminiRecipeResponse('Spaghetti Carbonara', [
        { name: 'pasta', quantity: '200', unit: 'g', confidenceLevel: 'high' },
      ])
    )
  })

  // ─── Missing API key ───────────────────────────────────────────────────────

  it('missing Gemini key → 503, code: IMPORT_SERVICE_UNAVAILABLE, nested envelope', async () => {
    mockGetApiKeys.mockReturnValue({ gemini: undefined })
    const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ message: expect.any(String), code: 'IMPORT_SERVICE_UNAVAILABLE' })
    expect(typeof body.error).toBe('object')
  })

  // ─── Invalid JSON ──────────────────────────────────────────────────────────

  it('invalid JSON body → 400, code: INVALID_REQUEST, nested envelope', async () => {
    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  // ─── Zod validation failure ────────────────────────────────────────────────

  it('missing url → 422, code: VALIDATION_ERROR, nested envelope', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('invalid url (non-http) → 422, code: VALIDATION_ERROR', async () => {
    const res = await POST(makeReq({ url: 'ftp://example.com/recipe' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  // ─── Target URL unreachable ────────────────────────────────────────────────

  it('target URL fetch throws → 503, nested envelope', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await POST(makeReq({ url: 'https://unreachable.example.com/recipe' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(typeof body.error).toBe('object')
    expect(body.error.code).toMatch(/URL_UNREACHABLE|URL_TIMEOUT/)
  })

  it('target URL returns non-200 → 503, code: URL_UNREACHABLE, nested envelope', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue('Not found'),
    })
    const res = await POST(makeReq({ url: 'https://example.com/missing' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'URL_UNREACHABLE' })
  })

  // ─── Gemini errors ─────────────────────────────────────────────────────────

  it('Gemini returns non-JSON → 422, code: AI_RESPONSE_UNPARSEABLE, nested envelope', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'This is not JSON at all' },
    })
    const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'AI_RESPONSE_UNPARSEABLE' })
  })

  it('Gemini returns no recipe (name="") → 422, code: NO_RECIPE_FOUND, nested envelope', async () => {
    mockGenerateContent.mockResolvedValue(geminiRecipeResponse(''))
    const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'NO_RECIPE_FOUND' })
  })

  // ─── P3: NO_CONTENT ───────────────────────────────────────────────────────

  it('page has too little readable text → 422, code: NO_CONTENT, nested envelope', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      htmlFetchResponse('<html><body></body></html>')
    )
    const res = await POST(makeReq({ url: 'https://example.com/empty' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'NO_CONTENT' })
  })

  // ─── P4: AI_RESPONSE_INVALID ──────────────────────────────────────────────

  it('Gemini returns valid JSON but wrong structure → 422, code: AI_RESPONSE_INVALID, nested envelope', async () => {
    // A JSON array is valid JSON but fails z.object() → safeParse fails
    mockGenerateContent.mockResolvedValue({
      response: { text: () => '[]' },
    })
    const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'AI_RESPONSE_INVALID' })
  })

  // ─── P5: AI_UNAVAILABLE ───────────────────────────────────────────────────

  it('Gemini API throws → 503, code: AI_UNAVAILABLE, nested envelope', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'))
    const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'AI_UNAVAILABLE' })
  })

  // ─── Success ───────────────────────────────────────────────────────────────

  it('success → { data: { recipe: { name, ingredients, ... } } } — data wrapper', async () => {
    const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Must be nested under data.recipe — not bare recipe
    expect(body.data).toBeDefined()
    expect(body.data.recipe).toBeDefined()
    expect(body.data.recipe.name).toBe('Spaghetti Carbonara')
    expect(Array.isArray(body.data.recipe.ingredients)).toBe(true)
    // Bare recipe should NOT be present at top level
    expect(body.recipe).toBeUndefined()
  })

  // ─── Calorie parsing edge cases ───────────────────────────────────────────

  describe('calorieEstimate parsing', () => {
    function geminiWithCalorie(calorieEstimate: unknown) {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              name: 'Test Recipe',
              description: '',
              calorieEstimate,
              servings: 1,
              ingredients: [],
            }),
        },
      })
    }

    it('string "500.7" → rounded to 501', async () => {
      geminiWithCalorie('500.7')
      const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
      expect(res.status).toBe(200)
      expect((await res.json()).data.recipe.calorieEstimate).toBe(501)
    })

    it('string "0" → null (zero is not a positive calorie count)', async () => {
      geminiWithCalorie('0')
      const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
      expect(res.status).toBe(200)
      expect((await res.json()).data.recipe.calorieEstimate).toBeNull()
    })

    it('negative number -100 → null', async () => {
      geminiWithCalorie(-100)
      const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
      expect(res.status).toBe(200)
      expect((await res.json()).data.recipe.calorieEstimate).toBeNull()
    })

    it('non-numeric string "lots" → null', async () => {
      geminiWithCalorie('lots')
      const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
      expect(res.status).toBe(200)
      expect((await res.json()).data.recipe.calorieEstimate).toBeNull()
    })

    it('explicit null → null', async () => {
      geminiWithCalorie(null)
      const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
      expect(res.status).toBe(200)
      expect((await res.json()).data.recipe.calorieEstimate).toBeNull()
    })

    it('absent calorieEstimate field → null', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({ name: 'Test Recipe', description: '', servings: 1, ingredients: [] }),
        },
      })
      const res = await POST(makeReq({ url: 'https://example.com/recipe' }))
      expect(res.status).toBe(200)
      expect((await res.json()).data.recipe.calorieEstimate).toBeNull()
    })
  })
})
