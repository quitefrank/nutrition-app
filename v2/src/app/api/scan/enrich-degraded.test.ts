/**
 * /api/scan/enrich — USDA and Gemini enrichment degraded states (Story 6.5 AC3 + AC5)
 *
 * Verifies that:
 *  - USDA failures produce null macros, never throw (lookupUsdaMacros try/catch)
 *  - Promise.allSettled means one USDA failure does not block sibling ingredient lookups
 *  - Gemini ingredient inference failures produce empty ingredients, never a 5xx
 *  - Each failure mode is isolated — the overall response is still 200 with the dish present
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
  vi.fn(() => ({
    gemini: 'AItest123456789012345678901234567890' as string | undefined,
    usda: 'usda-test-key' as string | undefined,
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

// Stub global fetch for USDA + MealDB calls
vi.stubGlobal('fetch', vi.fn())

// Import after mocks are set up
import { POST } from './enrich/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/scan/enrich', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Gemini returns a well-formed ingredient list with one item. */
function geminiIngredientsResponse(ingredients: unknown[] = [
  { name: 'Chicken breast', usda_name: 'chicken breast skinless', quantity: '150', unit: 'g' },
]) {
  return { text: JSON.stringify({ servings: 1, ingredients }) }
}

/** Well-formed USDA success response for chicken breast (per-100g values). */
function usdaSuccessResponse() {
  return {
    ok: true,
    json: () => Promise.resolve({
      foods: [{
        description: 'Chicken, broilers or fryers, breast, skinless',
        servingSize: 100,
        servingSizeUnit: 'g',
        foodNutrients: [
          { nutrientId: 1008, value: 165 }, // calories
          { nutrientId: 1003, value: 31 },  // protein
          { nutrientId: 1004, value: 3.6 }, // fat
          { nutrientId: 1005, value: 0 },   // carbs
        ],
      }],
    }),
  }
}

// ─── USDA degraded states ─────────────────────────────────────────────────────

describe('/api/scan/enrich — USDA degraded states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({
      gemini: 'AItest123456789012345678901234567890',
      usda: 'usda-test-key',
      places: undefined,
      cseKey: undefined,
      cseCx: undefined,
    })
    // Default: Gemini succeeds for inference + rating
    mockGenerateContent.mockResolvedValue(geminiIngredientsResponse())
    // Default: all fetch calls fail (no MealDB photo)
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response)
  })

  it('returns null macros for all ingredients when USDA API returns 500', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api.nal.usda.gov')) return { ok: false, status: 500 } as Response
      return { ok: false } as Response
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Grilled Chicken' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const ing = body.data.dishes[0].ingredients[0]
    expect(ing.calories_kcal).toBeNull()
    expect(ing.protein_g).toBeNull()
    expect(ing.fat_g).toBeNull()
    expect(ing.carbs_g).toBeNull()
  })

  it('returns null macros for all ingredients when USDA API returns 429', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api.nal.usda.gov')) return { ok: false, status: 429 } as Response
      return { ok: false } as Response
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Grilled Chicken' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const ing = body.data.dishes[0].ingredients[0]
    expect(ing.protein_g).toBeNull()
    expect(ing.fat_g).toBeNull()
  })

  it('returns null macros for all ingredients when USDA API times out (AbortController)', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api.nal.usda.gov')) {
        // Simulate AbortError — caught by lookupUsdaMacros try/catch → nullResult
        throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      }
      return { ok: false } as Response
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Grilled Chicken' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const ing = body.data.dishes[0].ingredients[0]
    expect(ing.protein_g).toBeNull()
  })

  it('returns null macros when usdaKey is not configured', async () => {
    mockGetApiKeys.mockReturnValue({
      gemini: 'AItest123456789012345678901234567890',
      usda: undefined,  // No USDA key
      places: undefined,
      cseKey: undefined,
      cseCx: undefined,
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Grilled Chicken' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const dish = body.data.dishes[0]
    // No USDA key → entire macro calculation is skipped → all null
    expect(dish.totalCalories).toBeNull()
    expect(dish.totalProtein).toBeNull()
    expect(dish.totalFat).toBeNull()
    expect(dish.totalCarbs).toBeNull()
  })

  it('returns null macros when USDA returns malformed JSON (Zod catch fires)', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api.nal.usda.gov')) {
        return {
          ok: true,
          // Returning a primitive (not an object) causes z.object().parse() to throw in lookupUsdaMacros
          json: () => Promise.resolve('not an object at all'),
        } as unknown as Response
      }
      return { ok: false } as Response
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Grilled Chicken' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const ing = body.data.dishes[0].ingredients[0]
    // ZodError caught → nullResult
    expect(ing.protein_g).toBeNull()
  })

  it('USDA failure for one ingredient does not block others (Promise.allSettled)', async () => {
    // Two ingredients: first USDA lookup fails, second succeeds
    mockGenerateContent.mockResolvedValue(
      geminiIngredientsResponse([
        { name: 'Ingredient A', usda_name: 'ingredient a', quantity: '100', unit: 'g' },
        { name: 'Ingredient B', usda_name: 'ingredient b', quantity: '150', unit: 'g' },
      ])
    )

    let usdaCallCount = 0
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api.nal.usda.gov')) {
        usdaCallCount++
        if (usdaCallCount === 1) {
          return { ok: false, status: 500 } as Response
        }
        return usdaSuccessResponse() as unknown as Response
      }
      return { ok: false } as Response
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Mixed Dish' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const ings = body.data.dishes[0].ingredients

    // Both ingredients are present — failure for one does not block the other
    expect(ings).toHaveLength(2)

    // Ingredient A (first USDA call failed) → null macros
    expect(ings[0].protein_g).toBeNull()

    // Ingredient B (second USDA call succeeded) → non-null protein
    // 31 g/100g × 1.5 (150g portion) = 46.5
    expect(ings[1].protein_g).not.toBeNull()
    expect(typeof ings[1].protein_g).toBe('number')
  })

  it('dish totals (totalCalories etc.) are null when all USDA lookups fail', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api.nal.usda.gov')) return { ok: false, status: 503 } as Response
      return { ok: false } as Response
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Grilled Chicken' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const dish = body.data.dishes[0]
    // sumOrNull([null]) → null (not 0)
    expect(dish.totalCalories).toBeNull()
    expect(dish.totalProtein).toBeNull()
    expect(dish.totalFat).toBeNull()
    expect(dish.totalCarbs).toBeNull()
  })
})

// ─── Gemini ingredient inference degraded states ──────────────────────────────

describe('/api/scan/enrich — Gemini ingredient inference degraded states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({
      gemini: 'AItest123456789012345678901234567890',
      usda: undefined,
      places: undefined,
      cseKey: undefined,
      cseCx: undefined,
    })
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response)
  })

  it('returns empty ingredients array when Gemini inference fails (network/model error)', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Gemini network error'))

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Mystery Dish' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // inferIngredients has a try/catch that returns { servings: 1, ingredients: [] }
    expect(body.data.dishes[0].ingredients).toEqual([])
  })

  it('returns empty ingredients array when Gemini returns invalid JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'definitely not json at all }{',
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Mystery Dish' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].ingredients).toEqual([])
  })

  it('returns empty ingredients array when Zod schema validation fails (top-level array)', async () => {
    // JSON.parse('[]') → [] — this is valid JSON but fails GeminiInferenceSchema
    // (which expects { servings, ingredients }), so safeParse returns false → empty []
    mockGenerateContent.mockResolvedValue({
      text: '[]',
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Mystery Dish' }] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].ingredients).toEqual([])
  })

  it('Gemini inference failure for one dish does not block other dishes', async () => {
    // With Promise.all, map callbacks start sequentially (dish1 first, dish2 second),
    // but their async execution overlaps. The calls to mockGenerateContent happen in
    // array order: [dish1.inference, dish2.inference, dish1.rating, dish2.rating].
    // Using mockRejectedValueOnce + mockResolvedValue (not Once) covers all orderings.
    mockGenerateContent
      .mockRejectedValueOnce(new Error('Gemini network error'))  // call 1: dish1 inference fails (non-transient → no retry)
      .mockResolvedValue(                                          // calls 2+: all others succeed
        geminiIngredientsResponse([
          { name: 'Lettuce', usda_name: 'romaine lettuce', quantity: '80', unit: 'g' },
        ])
      )

    const res = await POST(makeReq({
      dishes: [
        { id: 'd1', name: 'Unknown Dish' },
        { id: 'd2', name: 'Caesar Salad' },
      ],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Promise.all preserves array order, so indices 0 and 1 are deterministic
    expect(body.data.dishes).toHaveLength(2)
    expect(body.data.dishes[0].id).toBe('d1')
    expect(body.data.dishes[0].ingredients).toEqual([])   // empty from inference failure
    expect(body.data.dishes[1].id).toBe('d2')
    expect(body.data.dishes[1].ingredients).toHaveLength(1)
    expect(body.data.dishes[1].ingredients[0].name).toBe('Lettuce')
  })

  it('returns ENRICH_SERVICE_UNAVAILABLE 503 when no Gemini key configured', async () => {
    mockGetApiKeys.mockReturnValue({
      gemini: undefined,
      usda: undefined,
      places: undefined,
      cseKey: undefined,
      cseCx: undefined,
    })

    const res = await POST(makeReq({ dishes: [{ id: 'd1', name: 'Pasta' }] }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('ENRICH_SERVICE_UNAVAILABLE')
  })
})
