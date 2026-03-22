import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: undefined, places: undefined, usda: 'test-usda-key' })),
}))

// Default fetch mock — USDA returns a successful match
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRequest(body: object) {
  return new Request('http://localhost/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeGetListRequest(restaurantId?: string): NextRequest {
  const url = new URL('http://localhost/api/recipes')
  if (restaurantId) url.searchParams.set('restaurantId', restaurantId)
  return new NextRequest(url.toString())
}

const validPayload = {
  name: 'Duck Confit',
  dishImageUrl: 'https://example.com/duck.jpg',
  confidenceMetadata: { confidenceSource: 'gemini-only' },
  servingSize: 1,
  ingredients: [
    { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
    { name: 'Thyme', quantity: null, unit: null, confidenceLevel: 'high' },
  ],
}

const usdaSuccessResponse = {
  ok: true,
  json: async () => ({
    foods: [{
      servingSize: 240,          // 1 serving = 240g (e.g. 1 duck leg)
      servingSizeUnit: 'g',
      foodNutrients: [
        { nutrientId: 1008, value: 250 },  // 250 kcal per 100g
        { nutrientId: 1003, value: 20 },   // 20g protein per 100g
        { nutrientId: 1004, value: 10 },   // 10g fat per 100g
        { nutrientId: 1005, value: 30 },   // 30g carbs per 100g
      ]
    }]
  })
}

const usdaNoMatchResponse = {
  ok: true,
  json: async () => ({ foods: [] })
}

describe('POST /api/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: USDA returns a successful match for all ingredients
    mockFetch.mockResolvedValue(usdaSuccessResponse)
  })

  it('success: valid payload returns 200 with recipe data', async () => {
    const mockRecipe = {
      id: 'recipe-uuid-1',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
    })

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('recipe-uuid-1')
    expect(body.data.name).toBe('Duck Confit')
    expect(body.data.createdAt).toBe('2026-03-22T00:00:00Z')
    expect(body.data.servingSize).toBe(1)
    expect(body.data.restaurantId).toBeNull()
  })

  it('success zero ingredients: valid payload with empty array returns 200', async () => {
    const mockRecipe = {
      id: 'recipe-uuid-2',
      name: 'Simple Dish',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
    }))

    const res = await POST(makeRequest({ ...validPayload, name: 'Simple Dish', ingredients: [] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Simple Dish')
    // recipe_ingredients insert should NOT be called for empty array
    const ingredientCallCount = mockFrom.mock.calls.filter(([t]: [string]) => t === 'recipe_ingredients').length
    expect(ingredientCallCount).toBe(0)
  })

  it('validation error: missing name returns 422', async () => {
    const res = await POST(makeRequest({ ...validPayload, name: '' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('validation error: missing ingredients array returns 422', async () => {
    const res = await POST(makeRequest({ ...validPayload, ingredients: 'not-an-array' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('DB error on recipes insert returns 500', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        }
      }
    })

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })

  it('DB error on ingredients insert rolls back recipe row and returns 500', async () => {
    const mockRecipe = {
      id: 'recipe-uuid-rollback',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    const mockDelete = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({ error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
          delete: mockDelete,
          eq: mockEq,
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          insert: vi.fn().mockResolvedValue({ error: new Error('Ingredient DB error') }),
        }
      }
    })

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })

  // Restaurant association tests (Task 1)
  it('restaurant: when restaurantGooglePlacesId matches existing restaurant, uses existing id', async () => {
    const mockRecipe = {
      id: 'recipe-uuid-3',
      name: 'Duck Confit',
      restaurant_id: 'rest-existing-1',
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }

    // Call 1: from('restaurants') — google_places_id lookup → match
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'rest-existing-1' }, error: null }),
    })
    // Call 2: from('restaurants') — update updated_at
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // Call 3: from('recipes') — recipe insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
    })
    // Call 4: from('recipe_ingredients')
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const payload = { ...validPayload, restaurantGooglePlacesId: 'gp-123' }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.restaurantId).toBe('rest-existing-1')
  })

  it('restaurant: when restaurantName matches existing restaurant, uses existing id', async () => {
    const mockRecipe = {
      id: 'recipe-uuid-4',
      name: 'Duck Confit',
      restaurant_id: 'rest-existing-2',
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }

    // With name-only (no googlePlacesId): one lookup call then update call
    // Call 1: from('restaurants') — name lookup → match
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'rest-existing-2' }, error: null }),
    })
    // Call 2: from('restaurants') — update updated_at
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // Call 3: from('recipes') — recipe insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
    })
    // Call 4: from('recipe_ingredients')
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const payload = { ...validPayload, restaurantName: 'Le Canard' }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.restaurantId).toBe('rest-existing-2')
  })

  it('restaurant: when no match, creates new restaurant row and uses its id', async () => {
    const mockRecipe = {
      id: 'recipe-uuid-5',
      name: 'Duck Confit',
      restaurant_id: 'rest-new-1',
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }

    // With googlePlacesId + name: two lookup calls, then insert
    // Call 1: from('restaurants') — google_places_id lookup → no match
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    // Call 2: from('restaurants') — name lookup → no match
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    // Call 3: from('restaurants') — insert new
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'rest-new-1' }, error: null }),
    })
    // Call 4: from('recipes') — recipe insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
    })
    // Call 5: from('recipe_ingredients')
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const payload = { ...validPayload, restaurantName: 'New Place', restaurantGooglePlacesId: 'gp-new' }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.restaurantId).toBe('rest-new-1')
  })

  it('restaurant: when restaurant creation fails, recipe is saved with restaurant_id null (non-fatal)', async () => {
    const mockRecipe = {
      id: 'recipe-uuid-6',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }

    // With name-only: one lookup → no match → insert fails
    // Call 1: from('restaurants') — name lookup → no match
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    // Call 2: from('restaurants') — insert → error (non-fatal)
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error('Restaurant DB error') }),
    })
    // Call 3: from('recipes') — recipe insert succeeds with null restaurant_id
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
    })
    // Call 4: from('recipe_ingredients')
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const payload = { ...validPayload, restaurantName: 'New Place' }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.restaurantId).toBeNull()
  })

  it('restaurant: google_places_id lookup DB error with no name — skips restaurant association (non-fatal)', async () => {
    // When only googlePlacesId is provided (no name) and the lookup errors,
    // no new restaurant should be inserted (avoids Unknown Restaurant junk row)
    const mockRecipe = {
      id: 'recipe-uuid-8',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }

    // Call 1: from('restaurants') — google_places_id lookup → DB error
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('DB timeout') }),
    })
    // Call 2: from('recipes') — recipe insert (no restaurant insert should happen)
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
    })
    // Call 3: from('recipe_ingredients')
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    // Only googlePlacesId, no restaurantName
    const payload = { ...validPayload, restaurantGooglePlacesId: 'gp-err' }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Should save without restaurant association — not insert 'Unknown Restaurant'
    expect(body.data.restaurantId).toBeNull()
    // restaurants table should only have been queried once (the lookup), NOT inserted
    const restaurantInsertCalls = mockFrom.mock.calls.filter(([t]: [string]) => t === 'restaurants')
    expect(restaurantInsertCalls).toHaveLength(1) // only the lookup, no insert
  })

  // USDA macro lookup tests (Story 3.6)
  it('usda: USDA key configured + lookup succeeds → macros stored; correct URL and X-Api-Key header used', async () => {
    const mockRecipe = {
      id: 'recipe-usda-1',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          insert: vi.fn().mockImplementation((rows: unknown) => {
            capturedInsertArgs = rows
            return Promise.resolve({ error: null })
          }),
        }
      }
    })

    // Tier 2: "Duck leg" quantity="2" unit="pcs" + USDA servingSize=240g → scale=(2×240)/100=4.8
    // "Thyme" quantity=null → Tier 3 scale=1 → per-100g reference
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)

    // Assert fetch URL includes pageSize=1, dataType=Foundation and X-Api-Key header
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [url, options] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(url).toContain('pageSize=1')
    expect(url).toContain('dataType=Foundation,SR%20Legacy')
    expect(url).toContain('query=Duck%20leg')
    expect(options.headers['X-Api-Key']).toBe('test-usda-key')

    // Verify macros: Duck leg (Tier 2, scale=4.8) — assert all 4 columns
    const rows = capturedInsertArgs as Array<{ name: string; calories_kcal: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null }>
    expect(rows).toBeDefined()
    const duckRow = rows.find(r => r.name === 'Duck leg')!
    expect(duckRow.calories_kcal).toBe(1200)   // 250 × 4.8
    expect(duckRow.protein_g).toBe(96)          // 20 × 4.8
    expect(duckRow.fat_g).toBe(48)              // 10 × 4.8
    expect(duckRow.carbs_g).toBe(144)           // 30 × 4.8

    // Thyme (Tier 3, scale=1) — per-100g reference
    const thymeRow = rows.find(r => r.name === 'Thyme')!
    expect(thymeRow.calories_kcal).toBe(250)
    expect(thymeRow.protein_g).toBe(20)
    expect(thymeRow.fat_g).toBe(10)
    expect(thymeRow.carbs_g).toBe(30)
  })

  it('usda: ingredient with gram unit → macros scaled by quantity/100', async () => {
    const mockRecipe = {
      id: 'recipe-usda-scale',
      name: 'Salad',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          insert: vi.fn().mockImplementation((rows: unknown) => {
            capturedInsertArgs = rows
            return Promise.resolve({ error: null })
          }),
        }
      }
    })

    // Ingredient with 200g — should scale by 200/100 = 2
    const gramPayload = {
      name: 'Salad',
      ingredients: [{ name: 'Chicken breast', quantity: '200', unit: 'g', confidenceLevel: 'high' }],
    }
    const res = await POST(makeRequest(gramPayload))
    expect(res.status).toBe(200)

    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null; protein_g: number | null }>
    expect(rows[0].calories_kcal).toBe(500)   // 250 * 2
    expect(rows[0].protein_g).toBe(40)          // 20 * 2
  })

  it('usda: USDA key not configured → macros are null, recipe saves normally (200)', async () => {
    const { getApiKeys } = await import('@/lib/api-keys')
    vi.mocked(getApiKeys).mockReturnValueOnce({ gemini: undefined, places: undefined, usda: undefined })

    const mockRecipe = {
      id: 'recipe-usda-nokey',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          insert: vi.fn().mockImplementation((rows: unknown) => {
            capturedInsertArgs = rows
            return Promise.resolve({ error: null })
          }),
        }
      }
    })

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)

    // USDA should NOT have been called
    expect(mockFetch).not.toHaveBeenCalled()

    // Macros should be null
    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null }>
    rows.forEach(row => expect(row.calories_kcal).toBeNull())
  })

  it('usda: USDA fetch returns 404 → macros are null, recipe saves normally (200)', async () => {
    mockFetch.mockResolvedValue({ ok: false })

    const mockRecipe = {
      id: 'recipe-usda-404',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          insert: vi.fn().mockImplementation((rows: unknown) => {
            capturedInsertArgs = rows
            return Promise.resolve({ error: null })
          }),
        }
      }
    })

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)

    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null; protein_g: number | null }>
    rows.forEach(row => {
      expect(row.calories_kcal).toBeNull()
      expect(row.protein_g).toBeNull()
    })
  })

  it('usda: USDA fetch times out → macros are null, recipe saves normally (200)', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }))

    const mockRecipe = {
      id: 'recipe-usda-timeout',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          insert: vi.fn().mockImplementation((rows: unknown) => {
            capturedInsertArgs = rows
            return Promise.resolve({ error: null })
          }),
        }
      }
    })

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)

    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null }>
    rows.forEach(row => expect(row.calories_kcal).toBeNull())
  })

  it('usda: two ingredients, USDA finds first but not second → first has macros, second has nulls', async () => {
    const mockRecipe = {
      id: 'recipe-usda-partial',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          insert: vi.fn().mockImplementation((rows: unknown) => {
            capturedInsertArgs = rows
            return Promise.resolve({ error: null })
          }),
        }
      }
    })

    // First call (Duck leg) returns match, second call (Thyme) returns no match
    mockFetch
      .mockResolvedValueOnce(usdaSuccessResponse)
      .mockResolvedValueOnce(usdaNoMatchResponse)

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)

    const rows = capturedInsertArgs as Array<{ name: string; calories_kcal: number | null }>
    const duckRow = rows.find(r => r.name === 'Duck leg')!
    const thymeRow = rows.find(r => r.name === 'Thyme')!

    expect(duckRow.calories_kcal).toBe(1200)  // Tier 2: pcs + servingSize=240g → scale=4.8
    expect(thymeRow.calories_kcal).toBeNull()
  })

  it('usda: Tier 1 — gram and grams unit variants are scaled correctly (case-insensitive)', async () => {
    const mockRecipe = { id: 'recipe-tier1-gram', name: 'Pasta', restaurant_id: null, serving_size: 1, created_at: '2026-03-22T00:00:00Z' }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }) }
      if (table === 'recipe_ingredients') return { insert: vi.fn().mockImplementation((rows: unknown) => { capturedInsertArgs = rows; return Promise.resolve({ error: null }) }) }
    })

    // Test 'gram' unit: scale = (150 × 1) / 100 = 1.5 → calories = 250 × 1.5 = 375
    const gramPayload = { name: 'Pasta', ingredients: [{ name: 'Pasta', quantity: '150', unit: 'gram', confidenceLevel: 'high' }] }
    await POST(makeRequest(gramPayload))
    const rows1 = capturedInsertArgs as Array<{ calories_kcal: number | null }>
    expect(rows1[0].calories_kcal).toBe(375)

    // Test 'GRAMS' unit (case-insensitive): same scale
    capturedInsertArgs = undefined
    const gramsPayload = { name: 'Pasta', ingredients: [{ name: 'Pasta', quantity: '150', unit: 'GRAMS', confidenceLevel: 'high' }] }
    await POST(makeRequest(gramsPayload))
    const rows2 = capturedInsertArgs as Array<{ calories_kcal: number | null }>
    expect(rows2[0].calories_kcal).toBe(375)
  })

  it('usda: Tier 1 — kg unit applies correct gram conversion (×1000)', async () => {
    const mockRecipe = { id: 'recipe-tier1-kg', name: 'Beef', restaurant_id: null, serving_size: 1, created_at: '2026-03-22T00:00:00Z' }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }) }
      if (table === 'recipe_ingredients') return { insert: vi.fn().mockImplementation((rows: unknown) => { capturedInsertArgs = rows; return Promise.resolve({ error: null }) }) }
    })

    // 0.5 kg = 500g → scale = 500/100 = 5 → calories = 250×5 = 1250
    const kgPayload = { name: 'Beef', ingredients: [{ name: 'Beef', quantity: '0.5', unit: 'kg', confidenceLevel: 'high' }] }
    const res = await POST(makeRequest(kgPayload))
    expect(res.status).toBe(200)

    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null }>
    expect(rows[0].calories_kcal).toBe(1250)  // 250 × 5
    expect(rows[0].protein_g).toBe(100)        // 20 × 5
    expect(rows[0].fat_g).toBe(50)             // 10 × 5
    expect(rows[0].carbs_g).toBe(150)          // 30 × 5
  })

  it('usda: Tier 1 — oz unit applies correct gram conversion (×28.3495)', async () => {
    const mockRecipe = { id: 'recipe-tier1-oz', name: 'Cheese', restaurant_id: null, serving_size: 1, created_at: '2026-03-22T00:00:00Z' }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }) }
      if (table === 'recipe_ingredients') return { insert: vi.fn().mockImplementation((rows: unknown) => { capturedInsertArgs = rows; return Promise.resolve({ error: null }) }) }
    })

    // 4 oz = 113.398g → scale ≈ 1.13398 → calories = 250 × 1.13398 ≈ 283.5
    const ozPayload = { name: 'Cheese', ingredients: [{ name: 'Cheese', quantity: '4', unit: 'oz', confidenceLevel: 'high' }] }
    const res = await POST(makeRequest(ozPayload))
    expect(res.status).toBe(200)

    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null }>
    expect(rows[0].calories_kcal).toBeCloseTo(283.5, 0)  // within 0.5 of 283.5
  })

  it('usda: Tier 3 — count unit with USDA servingSize absent → stores per-100g reference (scale=1)', async () => {
    // Mock USDA response WITHOUT servingSize
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [{
          foodNutrients: [
            { nutrientId: 1008, value: 250 },
            { nutrientId: 1003, value: 20 },
            { nutrientId: 1004, value: 10 },
            { nutrientId: 1005, value: 30 },
          ]
        }]
      })
    })

    const mockRecipe = { id: 'recipe-tier3-noserving', name: 'Duck Confit', restaurant_id: null, serving_size: 1, created_at: '2026-03-22T00:00:00Z' }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }) }
      if (table === 'recipe_ingredients') return { insert: vi.fn().mockImplementation((rows: unknown) => { capturedInsertArgs = rows; return Promise.resolve({ error: null }) }) }
    })

    // pcs unit with NO servingSize → falls to Tier 3, scale=1 → per-100g reference
    const res = await POST(makeRequest({ name: 'Duck Confit', ingredients: [{ name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' }] }))
    expect(res.status).toBe(200)

    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null }>
    expect(rows[0].calories_kcal).toBe(250)  // Tier 3: scale=1
    expect(rows[0].protein_g).toBe(20)
    expect(rows[0].fat_g).toBe(10)
    expect(rows[0].carbs_g).toBe(30)
  })

  it('usda: Tier 3 — quantity "0" or negative falls through to per-100g reference (scale=1)', async () => {
    const mockRecipe = { id: 'recipe-tier3-qty', name: 'Flour', restaurant_id: null, serving_size: 1, created_at: '2026-03-22T00:00:00Z' }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }) }
      if (table === 'recipe_ingredients') return { insert: vi.fn().mockImplementation((rows: unknown) => { capturedInsertArgs = rows; return Promise.resolve({ error: null }) }) }
    })

    // quantity "0" with gram unit → validQty=false → Tier 3, scale=1
    await POST(makeRequest({ name: 'Flour', ingredients: [{ name: 'Flour', quantity: '0', unit: 'g', confidenceLevel: 'high' }] }))
    const rows1 = capturedInsertArgs as Array<{ calories_kcal: number | null }>
    expect(rows1[0].calories_kcal).toBe(250)  // no zero-scaled macros

    // quantity "-5" with gram unit → validQty=false → Tier 3, scale=1
    capturedInsertArgs = undefined
    await POST(makeRequest({ name: 'Flour', ingredients: [{ name: 'Flour', quantity: '-5', unit: 'g', confidenceLevel: 'high' }] }))
    const rows2 = capturedInsertArgs as Array<{ calories_kcal: number | null }>
    expect(rows2[0].calories_kcal).toBe(250)
  })

  it('usda: foodNutrients is not an array → macros null, recipe saves normally (200)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [{
          servingSize: 240,
          servingSizeUnit: 'g',
          foodNutrients: 'not-an-array',
        }]
      })
    })

    const mockRecipe = { id: 'recipe-usda-badshape', name: 'Duck Confit', restaurant_id: null, serving_size: 1, created_at: '2026-03-22T00:00:00Z' }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }) }
      if (table === 'recipe_ingredients') return { insert: vi.fn().mockImplementation((rows: unknown) => { capturedInsertArgs = rows; return Promise.resolve({ error: null }) }) }
    })

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)

    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null; protein_g: number | null }>
    rows.forEach(row => {
      expect(row.calories_kcal).toBeNull()
      expect(row.protein_g).toBeNull()
    })
  })

  it('usda: ingredient with empty name → fetch not called for that ingredient, macros null', async () => {
    const mockRecipe = { id: 'recipe-usda-emptyname', name: 'Mystery', restaurant_id: null, serving_size: 1, created_at: '2026-03-22T00:00:00Z' }
    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }) }
      if (table === 'recipe_ingredients') return { insert: vi.fn().mockImplementation((rows: unknown) => { capturedInsertArgs = rows; return Promise.resolve({ error: null }) }) }
    })

    // Single ingredient with empty name
    const res = await POST(makeRequest({ name: 'Mystery', ingredients: [{ name: '', quantity: '100', unit: 'g', confidenceLevel: 'high' }] }))
    expect(res.status).toBe(200)

    // fetch should NOT be called for empty name
    expect(mockFetch).not.toHaveBeenCalled()

    const rows = capturedInsertArgs as Array<{ calories_kcal: number | null }>
    expect(rows[0].calories_kcal).toBeNull()
  })

  it('restaurant: when no restaurant fields in payload, restaurant_id is null', async () => {
    const mockRecipe = {
      id: 'recipe-uuid-7',
      name: 'Duck Confit',
      restaurant_id: null,
      serving_size: 1,
      created_at: '2026-03-22T00:00:00Z',
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockRecipe, error: null }),
        }
      }
      if (table === 'recipe_ingredients') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
    })

    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.restaurantId).toBeNull()
    // restaurants table should NOT be queried
    const restaurantCallCount = mockFrom.mock.calls.filter(([t]: [string]) => t === 'restaurants').length
    expect(restaurantCallCount).toBe(0)
  })
})

describe('GET /api/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('success: returns { data: Recipe[] } with camelCase fields ordered by created_at desc', async () => {
    const mockRows = [
      {
        id: 'recipe-1',
        name: 'Duck Confit',
        restaurant_id: 'rest-1',
        dish_image_url: 'https://example.com/duck.jpg',
        confidence_metadata_json: null,
        serving_size: 1,
        created_at: '2026-03-22T00:00:00Z',
        restaurants: {
          id: 'rest-1',
          name: 'Le Canard',
          google_places_id: null,
          atmospheric_palette_json: null,
          updated_at: '2026-03-22T00:00:00Z',
        },
      },
    ]
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    }))

    const res = await GET(makeGetListRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    const recipe = body.data[0]
    expect(recipe.id).toBe('recipe-1')
    expect(recipe.name).toBe('Duck Confit')
    expect(recipe.restaurantId).toBe('rest-1')
    expect(recipe.dishImageUrl).toBe('https://example.com/duck.jpg')
    expect(recipe.confidenceMetadataJson).toBeNull()
    expect(recipe.servingSize).toBe(1)
    expect(recipe.createdAt).toBe('2026-03-22T00:00:00Z')
    expect(recipe.restaurant.name).toBe('Le Canard')
  })

  it('success empty: returns { data: [] } when table is empty', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }))

    const res = await GET(makeGetListRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('success: maps restaurant null when restaurants join returns null', async () => {
    const mockRows = [
      {
        id: 'recipe-2',
        name: 'Mystery Dish',
        restaurant_id: null,
        dish_image_url: null,
        confidence_metadata_json: null,
        serving_size: 1,
        created_at: '2026-03-22T00:00:00Z',
        restaurants: null,
      },
    ]
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    }))

    const res = await GET(makeGetListRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].restaurant).toBeNull()
  })

  it('DB error: returns { error, code: DB_ERROR } HTTP 500', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    }))

    const res = await GET(makeGetListRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to fetch recipes')
    expect(body.code).toBe('DB_ERROR')
  })

  // restaurantId filter test (Task 3)
  it('filter: GET with ?restaurantId=xxx adds .eq filter and returns filtered recipes', async () => {
    const filteredRows = [
      {
        id: 'recipe-3',
        name: 'Ramen',
        restaurant_id: 'rest-abc',
        dish_image_url: null,
        confidence_metadata_json: null,
        serving_size: 1,
        created_at: '2026-03-22T00:00:00Z',
        restaurants: {
          id: 'rest-abc',
          name: 'Ichiran',
          google_places_id: null,
          atmospheric_palette_json: null,
          updated_at: '2026-03-22T00:00:00Z',
        },
      },
    ]
    const eqMock = vi.fn().mockResolvedValue({ data: filteredRows, error: null })
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnValue({ eq: eqMock }),
    }))

    const res = await GET(makeGetListRequest('rest-abc'))
    expect(res.status).toBe(200)
    expect(eqMock).toHaveBeenCalledWith('restaurant_id', 'rest-abc')
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].restaurantId).toBe('rest-abc')
  })

  it('filter: GET with empty ?restaurantId= ignores the filter and returns all recipes', async () => {
    const allRows = [
      { id: 'r1', name: 'Duck Confit', restaurant_id: null, dish_image_url: null, confidence_metadata_json: null, serving_size: 1, created_at: '2026-03-22T00:00:00Z', restaurants: null },
    ]
    const orderMock = vi.fn().mockResolvedValue({ data: allRows, error: null })
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: orderMock,
    }))

    // Empty string restaurantId should be treated as absent (no filter applied)
    const url = new URL('http://localhost/api/recipes')
    url.searchParams.set('restaurantId', '')
    const res = await GET(new NextRequest(url.toString()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
  })

  it('filter: GET without restaurantId returns all recipes (existing behaviour unchanged)', async () => {
    const allRows = [
      {
        id: 'recipe-1',
        name: 'Duck Confit',
        restaurant_id: null,
        dish_image_url: null,
        confidence_metadata_json: null,
        serving_size: 1,
        created_at: '2026-03-22T00:00:00Z',
        restaurants: null,
      },
      {
        id: 'recipe-2',
        name: 'Ramen',
        restaurant_id: 'rest-abc',
        dish_image_url: null,
        confidence_metadata_json: null,
        serving_size: 1,
        created_at: '2026-03-21T00:00:00Z',
        restaurants: null,
      },
    ]
    const orderMock = vi.fn().mockResolvedValue({ data: allRows, error: null })
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: orderMock,
    }))

    const res = await GET(makeGetListRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
  })
})
