import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() =>
  vi.fn(() => ({
    usda: 'test-usda-key' as string | null,
    places: null as string | null,
    gemini: null as string | null,
    cseKey: null as string | null,
    cseCx: null as string | null,
    supabaseUrl: null as string | null,
    supabaseServiceRole: null as string | null,
  }))
)

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: mockGetApiKeys,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

global.fetch = vi.fn()

// Import after mocks
import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/usda/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const RECIPE_ID_1 = '11111111-1111-4111-8111-111111111111'
const RECIPE_ID_2 = '22222222-2222-4222-8222-222222222222'
const ING_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ING_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

/** A verified ingredient row (usda_fdc_id already set) */
function verifiedIngRow(overrides = {}) {
  return {
    id: ING_ID_1,
    recipe_id: RECIPE_ID_1,
    name: 'Chicken breast',
    usda_fdc_id: 12345,
    calories_per_serving: 165,
    protein_g: 31,
    fat_g: 3.6,
    carbs_g: 0,
    confidence: 'high',
    ...overrides,
  }
}

/** An unverified ingredient row (usda_fdc_id is null) */
function unverifiedIngRow(overrides = {}) {
  return {
    id: ING_ID_1,
    recipe_id: RECIPE_ID_1,
    name: 'Brown rice',
    usda_fdc_id: null,
    calories_per_serving: null,
    protein_g: null,
    fat_g: null,
    carbs_g: null,
    confidence: 'medium',
    ...overrides,
  }
}

/** USDA search response with a matching food */
function usdaMatchResponse(overrides: Partial<{
  fdcId: number
  description: string
  dataType: string
  calories: number
  protein: number
  fat: number
  carbs: number
}> = {}) {
  const {
    fdcId = 99999,
    description = 'Brown rice, cooked',
    dataType = 'SR Legacy',
    calories = 216,
    protein = 4.5,
    fat = 1.8,
    carbs = 45,
  } = overrides

  return {
    ok: true,
    json: async () => ({
      foods: [
        {
          fdcId,
          description,
          dataType,
          foodNutrients: [
            { nutrientId: 1008, nutrientName: 'Energy', value: calories },
            { nutrientId: 1003, nutrientName: 'Protein', value: protein },
            { nutrientId: 1004, nutrientName: 'Total lipid (fat)', value: fat },
            { nutrientId: 1005, nutrientName: 'Carbohydrate, by difference', value: carbs },
          ],
        },
      ],
    }),
  } as Response
}

/** USDA response with empty foods array */
function usdaEmptyResponse() {
  return {
    ok: true,
    json: async () => ({ foods: [] }),
  } as Response
}

/** Sets up a successful Supabase chain: select returns rows, update returns no error */
function setupSupabaseSelect(rows: object[]) {
  const selectMock = vi.fn().mockResolvedValue({ data: rows, error: null })
  const inMock = vi.fn(() => ({ select: () => ({ data: rows, error: null }), then: undefined }))

  // Build a chain that handles .select('*').in(...)
  const selectChain = {
    in: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  const fromSelectReturn = {
    select: vi.fn().mockReturnValue(selectChain),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }

  mockFrom.mockImplementation((table: string) => {
    if (table === 'recipe_ingredients') return fromSelectReturn
    if (table === 'recipes') return {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
    return fromSelectReturn
  })

  return fromSelectReturn
}

// ─── Tests ────────────────────────────────────────────────

describe('POST /api/usda/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({
      usda: 'test-usda-key',
      places: null,
      gemini: null,
      cseKey: null,
      cseCx: null,
      supabaseUrl: null,
      supabaseServiceRole: null,
    })
    vi.mocked(global.fetch).mockResolvedValue(usdaMatchResponse())
  })

  // ─── Input validation ─────────────────────────────────

  describe('input validation', () => {
    it('invalid JSON body → 400, code: INVALID_REQUEST, nested error envelope', async () => {
      const req = new NextRequest('http://localhost/api/usda/verify', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body).toMatchObject({ error: { message: expect.any(String), code: 'INVALID_REQUEST' } })
    })

    it('missing recipeIds field → 422, code: VALIDATION_ERROR', async () => {
      const req = makeReq({})
      const res = await POST(req)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    })

    it('recipeIds is empty array → 422, code: VALIDATION_ERROR (min(1) constraint)', async () => {
      const req = makeReq({ recipeIds: [] })
      const res = await POST(req)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    })

    it('recipeIds contains non-UUID string → 422, code: VALIDATION_ERROR', async () => {
      const req = makeReq({ recipeIds: ['not-a-uuid'] })
      const res = await POST(req)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    })

    it('recipeIds exceeds max (51 items) → 422, code: VALIDATION_ERROR', async () => {
      const ids = Array.from({ length: 51 }, (_, i) =>
        `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`
      )
      const req = makeReq({ recipeIds: ids })
      const res = await POST(req)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    })

    it('Supabase fetch error → 503, code: DB_SERVICE_UNAVAILABLE', async () => {
      const selectChain = { in: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection refused' } }) }
      mockFrom.mockImplementation(() => ({ select: vi.fn().mockReturnValue(selectChain) }))

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body).toMatchObject({ error: { code: 'DB_SERVICE_UNAVAILABLE' } })
    })
  })

  // ─── No unverified ingredients ────────────────────────

  describe('no unverified ingredients', () => {
    it('all ingredients already have usda_fdc_id → 200, verified: 0, total: 0', async () => {
      const rows = [verifiedIngRow()]
      const selectChain = { in: vi.fn().mockResolvedValue({ data: rows, error: null }) }
      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return { select: vi.fn().mockReturnValue(selectChain) }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.verified).toBe(0)
      expect(body.data.total).toBe(0)
      expect(body.data.recipes).toHaveLength(1)
    })

    it('no recipe_ingredients rows at all → 200, verified: 0, total: 0, recipes: []', async () => {
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [], error: null }) }
      mockFrom.mockImplementation(() => ({ select: vi.fn().mockReturnValue(selectChain) }))

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.verified).toBe(0)
      expect(body.data.total).toBe(0)
      // Recipe appears with null totals (no ingredients)
      expect(body.data.recipes[0].totalCalories).toBeNull()
    })
  })

  // ─── USDA match found ─────────────────────────────────

  describe('USDA match found', () => {
    it('single ingredient matched → recipe_ingredients updated with fdcId, macros, confidence: high', async () => {
      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }
      const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
      const recipeEqMock = vi.fn().mockResolvedValue({ error: null })
      const recipeUpdateMock = vi.fn().mockReturnValue({ eq: recipeEqMock })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: recipeUpdateMock }
      })

      vi.mocked(global.fetch).mockResolvedValue(usdaMatchResponse({
        fdcId: 12345,
        calories: 216,
        protein: 4.5,
        fat: 1.8,
        carbs: 45,
      }))

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.verified).toBe(1)

      // Confirm update was called with correct values
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          usda_fdc_id: 12345,
          calories_per_serving: 216,
          protein_g: 4.5,
          fat_g: 1.8,
          carbs_g: 45,
          confidence: 'high',
        })
      )
      expect(eqMock).toHaveBeenCalledWith('id', ING_ID_1)
    })

    it('multiple ingredients in parallel → all matched; verified count correct', async () => {
      const ing1 = unverifiedIngRow({ id: ING_ID_1, name: 'Brown rice' })
      const ing2 = unverifiedIngRow({ id: ING_ID_2, name: 'Chicken breast', recipe_id: RECIPE_ID_1 })
      const rows = [ing1, ing2]

      const selectChain = { in: vi.fn().mockResolvedValue({ data: rows, error: null }) }
      const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
      const recipeEqMock = vi.fn().mockResolvedValue({ error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: recipeEqMock }) }
      })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(usdaMatchResponse({ fdcId: 111, calories: 200 }))
        .mockResolvedValueOnce(usdaMatchResponse({ fdcId: 222, calories: 165 }))

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.verified).toBe(2)
      expect(body.data.total).toBe(2)
    })

    it('partial match (some match, some not) → matched rows updated; unmatched unchanged; recipe totals use available data', async () => {
      const ing1 = unverifiedIngRow({ id: ING_ID_1, name: 'Brown rice' })
      const ing2 = unverifiedIngRow({ id: ING_ID_2, name: 'Mystery ingredient' })
      const rows = [ing1, ing2]

      const selectChain = { in: vi.fn().mockResolvedValue({ data: rows, error: null }) }
      const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(usdaMatchResponse({ fdcId: 111, calories: 216, protein: 4.5, fat: 1.8, carbs: 45 }))
        .mockResolvedValueOnce(usdaEmptyResponse()) // no match

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.verified).toBe(1)
      expect(body.data.total).toBe(2)
      // Only 1 ingredient matched; totalCalories reflects that one
      expect(body.data.recipes[0].totalCalories).toBe(216)
    })
  })

  // ─── USDA match not found ──────────────────────────────

  describe('USDA match not found', () => {
    it('USDA returns empty foods array → ingredient row unchanged (usda_fdc_id stays null)', async () => {
      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }
      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch).mockResolvedValue(usdaEmptyResponse())

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      // verified: 0 because empty foods → no match
      expect(body.data.verified).toBe(0)
      // Update should NOT have been called (no match to persist)
      expect(updateMock).not.toHaveBeenCalled()
    })

    it('USDA returns foods but none have required nutrients → ingredient row unchanged', async () => {
      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }
      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          foods: [
            {
              fdcId: 99,
              description: 'Some food',
              dataType: 'SR Legacy',
              foodNutrients: [], // no nutrients
            },
          ],
        }),
      } as Response)

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      // Match found (non-null fdcId from extractMacros), but macros all null
      // The ingredient IS updated — just with null macro values
      expect(body.data.verified).toBe(1)
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          usda_fdc_id: 99,
          calories_per_serving: null,
          protein_g: null,
          fat_g: null,
          carbs_g: null,
          confidence: 'high',
        })
      )
    })
  })

  // ─── USDA failure handling ────────────────────────────

  describe('USDA failure handling', () => {
    it('fetch throws for one ingredient → that ingredient unchanged; others proceed; no 500', async () => {
      const ing1 = unverifiedIngRow({ id: ING_ID_1, name: 'Brown rice' })
      const ing2 = unverifiedIngRow({ id: ING_ID_2, name: 'Chicken breast' })
      const rows = [ing1, ing2]

      const selectChain = { in: vi.fn().mockResolvedValue({ data: rows, error: null }) }
      const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch)
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce(usdaMatchResponse({ fdcId: 222, calories: 165 }))

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      // Only 2nd ingredient matched
      expect(body.data.verified).toBe(1)
      expect(body.data.total).toBe(2)
    })

    it('fetch throws for ALL ingredients → no DB updates; 200 with verified: 0', async () => {
      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }
      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch).mockRejectedValue(new Error('Total USDA failure'))

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.verified).toBe(0)
      expect(updateMock).not.toHaveBeenCalled()
    })

    it('USDA returns non-200 status → ingredient treated as no-match; row unchanged', async () => {
      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }
      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 429 } as Response)

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.verified).toBe(0)
      expect(updateMock).not.toHaveBeenCalled()
    })
  })

  // ─── Zod parse failure on USDA response ───────────────

  describe('Zod parse failure on USDA response', () => {
    it('USDA returns unexpected shape → parse throws → ingredient unchanged; route continues; warning logged', async () => {
      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }
      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      // Return a response that will fail strict Zod parse: no foods key
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ not_foods: 'oops' }),
      } as Response)

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      // Zod parse throws → caught → no match → verified: 0
      expect(body.data.verified).toBe(0)
      expect(updateMock).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })

  // ─── Macro total recalculation ────────────────────────

  describe('macro total recalculation', () => {
    it('totals recalculated correctly after partial USDA update', async () => {
      const ing1 = unverifiedIngRow({ id: ING_ID_1, name: 'Brown rice' })
      const ing2 = verifiedIngRow({
        id: ING_ID_2,
        recipe_id: RECIPE_ID_1,
        usda_fdc_id: 777,
        calories_per_serving: 100,
        protein_g: 10,
        fat_g: 2,
        carbs_g: 15,
      })
      const rows = [ing1, ing2]

      const selectChain = { in: vi.fn().mockResolvedValue({ data: rows, error: null }) }
      const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      // ing1 gets USDA match: 216 kcal; ing2 already verified: 100 kcal
      vi.mocked(global.fetch).mockResolvedValue(usdaMatchResponse({
        fdcId: 111,
        calories: 216,
        protein: 4.5,
        fat: 1.8,
        carbs: 45,
      }))

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      // 216 (USDA updated) + 100 (already verified) = 316
      expect(body.data.recipes[0].totalCalories).toBe(316)
      expect(body.data.recipes[0].totalProtein).toBeCloseTo(14.5, 1)
    })

    it('all null macros → totalCalories null (not 0)', async () => {
      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return { select: vi.fn().mockReturnValue(selectChain) }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch).mockResolvedValue(usdaEmptyResponse())

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.recipes[0].totalCalories).toBeNull()
    })

    it('mixed null/non-null macros → nulls excluded from sum', async () => {
      // ing1 has calories, ing2 has no calories (null)
      const ing1 = verifiedIngRow({
        id: ING_ID_1,
        usda_fdc_id: 1,
        calories_per_serving: 200,
        protein_g: 10,
        fat_g: null,
        carbs_g: 30,
      })
      const ing2 = verifiedIngRow({
        id: ING_ID_2,
        usda_fdc_id: 2,
        calories_per_serving: null,
        protein_g: 5,
        fat_g: 3,
        carbs_g: null,
      })
      const rows = [ing1, ing2]

      const selectChain = { in: vi.fn().mockResolvedValue({ data: rows, error: null }) }
      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return { select: vi.fn().mockReturnValue(selectChain) }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      const recipe = body.data.recipes[0]
      // calories: 200 + null = 200 (null excluded)
      expect(recipe.totalCalories).toBe(200)
      // protein: 10 + 5 = 15
      expect(recipe.totalProtein).toBe(15)
      // fat: null + 3 = 3
      expect(recipe.totalFat).toBe(3)
      // carbs: 30 + null = 30
      expect(recipe.totalCarbs).toBe(30)
    })
  })

  // ─── USDA key absent ──────────────────────────────────

  describe('USDA key absent', () => {
    it('getApiKeys().usda is null → uses DEMO_KEY; route still works (no 503)', async () => {
      mockGetApiKeys.mockReturnValue({
        usda: null,
        places: null,
        gemini: null,
        cseKey: null,
        cseCx: null,
        supabaseUrl: null,
        supabaseServiceRole: null,
      })

      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }
      const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch).mockResolvedValue(usdaMatchResponse())

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      // Should NOT be 503 — DEMO_KEY fallback prevents service failure
      expect(res.status).toBe(200)

      // Confirm fetch was called with DEMO_KEY in the X-Api-Key header, not the URL
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        expect.stringContaining('api.nal.usda.gov/fdc/v1/foods/search'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Api-Key': 'DEMO_KEY' }),
        })
      )
      const callUrl = vi.mocked(global.fetch).mock.calls[0][0] as string
      expect(callUrl).not.toContain('api_key')
    })
  })

  // ─── Response shape ───────────────────────────────────

  describe('response shape', () => {
    it('all success responses use { data: { verified, total, recipes: [...] } } format', async () => {
      const ing = unverifiedIngRow()
      const selectChain = { in: vi.fn().mockResolvedValue({ data: [ing], error: null }) }

      mockFrom.mockImplementation((table: string) => {
        if (table === 'recipe_ingredients') return {
          select: vi.fn().mockReturnValue(selectChain),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })

      vi.mocked(global.fetch).mockResolvedValue(usdaMatchResponse())

      const req = makeReq({ recipeIds: [RECIPE_ID_1] })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()

      // Top-level must be { data: { ... } }
      expect(body).toHaveProperty('data')
      expect(body).not.toHaveProperty('error')
      expect(typeof body.data.verified).toBe('number')
      expect(typeof body.data.total).toBe('number')
      expect(Array.isArray(body.data.recipes)).toBe(true)

      const recipe = body.data.recipes[0]
      expect(recipe).toHaveProperty('recipeId')
      expect('totalCalories' in recipe).toBe(true)
      expect('totalProtein' in recipe).toBe(true)
      expect('totalFat' in recipe).toBe(true)
      expect('totalCarbs' in recipe).toBe(true)
    })

    it('all error responses use { error: { message, code } } format', async () => {
      const req = makeReq({ recipeIds: 'not-an-array' })
      const res = await POST(req)
      const body = await res.json()

      expect(typeof body.error).toBe('object')
      expect(typeof body.error.message).toBe('string')
      expect(typeof body.error.code).toBe('string')
      expect(body).not.toHaveProperty('data')
    })
  })
})
