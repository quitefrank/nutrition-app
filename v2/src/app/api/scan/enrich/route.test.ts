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
  vi.fn(() => ({
    gemini: 'AItest123456789012345678901234567890' as string | undefined,
    usda: undefined as string | undefined,
    places: undefined as string | undefined,
    cseKey: undefined as string | undefined,
    cseCx: undefined as string | undefined,
  }))
)

vi.mock('@google/genai', () => ({
  GoogleGenAI: MockGoogleGenAI,
}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: mockGetApiKeys,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

// Mock fetch for USDA + MealDB calls — vi.stubGlobal so Vitest can restore it
vi.stubGlobal('fetch', vi.fn())

// Import after mocks are set up
import { POST } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/scan/enrich', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Gemini returns a well-formed ingredient JSON */
function geminiIngredientsResponse(ingredients: unknown[] = [
  { name: 'Chicken breast', usda_name: 'chicken breast skinless', quantity: '150', unit: 'g' },
]) {
  const payload = { servings: 1, ingredients }
  return { text: JSON.stringify(payload) }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/scan/enrich', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({
      gemini: 'AItest123456789012345678901234567890',
      usda: undefined,
      places: undefined,
      cseKey: undefined,
      cseCx: undefined,
    })
    // Default: Gemini returns a valid ingredient list
    mockGenerateContent.mockResolvedValue(geminiIngredientsResponse())
    // Default: MealDB returns no photo
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response)
  })

  // ─── Validation ───────────────────────────────────────────────────────────

  describe('validation', () => {
    it('missing Gemini key → 503, nested error { error: { message, code: "ENRICH_SERVICE_UNAVAILABLE" } }', async () => {
      mockGetApiKeys.mockReturnValue({
        gemini: undefined,
        usda: undefined,
        places: undefined,
        cseKey: undefined,
        cseCx: undefined,
      })
      const req = makeReq({ dishes: [{ name: 'Pasta' }] })
      const res = await POST(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body).toMatchObject({
        error: { message: expect.any(String), code: 'ENRICH_SERVICE_UNAVAILABLE' },
      })
    })

    it('invalid JSON body → 400, code: INVALID_REQUEST', async () => {
      const req = new NextRequest('http://localhost/api/scan/enrich', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body).toMatchObject({
        error: { code: 'INVALID_REQUEST' },
      })
    })

    it('empty dishes array → 200, { data: { dishes: [] } }', async () => {
      const req = makeReq({ dishes: [] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ data: { dishes: [] } })
    })
  })

  // ─── Ingredient inference ─────────────────────────────────────────────────

  describe('ingredient inference', () => {
    it('Gemini returns valid ingredient JSON → ingredients extracted, macros null (no USDA key)', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiIngredientsResponse([
          { name: 'Chicken breast', usda_name: 'chicken breast skinless', quantity: '150', unit: 'g' },
        ])
      )
      const req = makeReq({ dishes: [{ id: 'd1', name: 'Grilled Chicken' }] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      const dish = body.data.dishes[0]
      expect(dish.ingredients).toHaveLength(1)
      expect(dish.ingredients[0].name).toBe('Chicken breast')
      // No USDA key → all macros null
      expect(dish.ingredients[0].calories_kcal).toBeNull()
      expect(dish.ingredients[0].protein_g).toBeNull()
    })

    it('Gemini returns bad JSON → empty ingredients, dish still in response', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'this is not json at all',
      })
      const req = makeReq({ dishes: [{ id: 'd1', name: 'Mystery Dish' }] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.dishes).toHaveLength(1)
      expect(body.data.dishes[0].ingredients).toEqual([])
    })

    it('Gemini returns valid JSON that fails schema (top-level array) → empty ingredients, dish still in response', async () => {
      // This exercises the safeParse failure path specifically: JSON.parse succeeds,
      // but the result is a top-level array, not the expected { servings, ingredients } object.
      mockGenerateContent.mockResolvedValue({
        text: '[]',
      })
      const req = makeReq({ dishes: [{ id: 'd1', name: 'Tacos' }] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.dishes).toHaveLength(1)
      expect(body.data.dishes[0].ingredients).toEqual([])
    })

    it('Gemini returns partial ingredient (missing unit) → ingredient included with null unit', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiIngredientsResponse([
          { name: 'Olive oil', usda_name: 'olive oil', quantity: '15' },
          // unit is missing entirely
        ])
      )
      const req = makeReq({ dishes: [{ id: 'd1', name: 'Salad' }] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      const ing = body.data.dishes[0].ingredients[0]
      expect(ing.name).toBe('Olive oil')
      expect(ing.unit).toBeNull()
    })
  })

  // ─── Macro calculation ────────────────────────────────────────────────────

  describe('macro calculation', () => {
    it('no USDA key → totalCalories/totalProtein/totalFat/totalCarbs all null', async () => {
      const req = makeReq({ dishes: [{ id: 'd1', name: 'Burger' }] })
      const res = await POST(req)
      const body = await res.json()
      const dish = body.data.dishes[0]
      expect(dish.totalCalories).toBeNull()
      expect(dish.totalProtein).toBeNull()
      expect(dish.totalFat).toBeNull()
      expect(dish.totalCarbs).toBeNull()
    })

    it('single ingredient with null macros → sum is null (not 0)', async () => {
      // Even with ingredients, no USDA key means macros are null, not 0
      mockGenerateContent.mockResolvedValue(
        geminiIngredientsResponse([
          { name: 'Rice', usda_name: 'white rice', quantity: '100', unit: 'g' },
        ])
      )
      const req = makeReq({ dishes: [{ id: 'd1', name: 'Rice Bowl' }] })
      const res = await POST(req)
      const body = await res.json()
      const dish = body.data.dishes[0]
      // null, not 0
      expect(dish.totalCalories).toBeNull()
      expect(dish.totalProtein).toBeNull()
    })
  })

  // ─── Response shape ───────────────────────────────────────────────────────

  describe('response shape', () => {
    it('success → { data: { dishes: [{ id, name, servings, ingredients, photoUrl, totalCalories, ... }] } }', async () => {
      const req = makeReq({ dishes: [{ id: 'dish-1', name: 'Pasta Carbonara' }] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('data.dishes')
      const dish = body.data.dishes[0]
      expect(dish).toMatchObject({
        id: 'dish-1',
        name: 'Pasta Carbonara',
        servings: expect.any(Number),
        ingredients: expect.any(Array),
      })
      expect(dish.photoUrl).toBeNull()
      expect('totalCalories' in dish).toBe(true)
      expect('totalProtein' in dish).toBe(true)
      expect('totalFat' in dish).toBe(true)
      expect('totalCarbs' in dish).toBe(true)
    })

    it('multiple dishes → each dish in response has its own enrichment', async () => {
      // Promise.all starts calls in array order; mockResolvedValueOnce is consumed in call order.
      // Per-ingredient assertions catch any cross-dish contamination or ordering regression.
      mockGenerateContent
        .mockResolvedValueOnce(
          geminiIngredientsResponse([{ name: 'Tomato', usda_name: 'tomato', quantity: '100', unit: 'g' }])
        )
        .mockResolvedValueOnce(
          geminiIngredientsResponse([{ name: 'Lettuce', usda_name: 'romaine lettuce', quantity: '80', unit: 'g' }])
        )

      const req = makeReq({
        dishes: [
          { id: 'd1', name: 'Bruschetta' },
          { id: 'd2', name: 'Caesar Salad' },
        ],
      })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.dishes).toHaveLength(2)
      expect(body.data.dishes[0].id).toBe('d1')
      expect(body.data.dishes[0].ingredients[0].name).toBe('Tomato')
      expect(body.data.dishes[1].id).toBe('d2')
      expect(body.data.dishes[1].ingredients[0].name).toBe('Lettuce')
    })
  })

  // ─── Error envelope ───────────────────────────────────────────────────────

  describe('error envelope', () => {
    it('all error responses use nested { error: { message, code } } format — missing Gemini key', async () => {
      mockGetApiKeys.mockReturnValue({
        gemini: undefined,
        usda: undefined,
        places: undefined,
        cseKey: undefined,
        cseCx: undefined,
      })
      const req = makeReq({ dishes: [{ name: 'Pasta' }] })
      const res = await POST(req)
      const body = await res.json()
      // Flat format { error: "string" } must NOT be present
      expect(typeof body.error).toBe('object')
      expect(typeof body.error.message).toBe('string')
      expect(typeof body.error.code).toBe('string')
    })

    it('invalid JSON body error uses nested { error: { message, code } } format', async () => {
      const req = new NextRequest('http://localhost/api/scan/enrich', {
        method: 'POST',
        body: '{bad json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req)
      const body = await res.json()
      expect(typeof body.error).toBe('object')
      expect(typeof body.error.message).toBe('string')
      expect(body.error.code).toBe('INVALID_REQUEST')
    })
  })
})
