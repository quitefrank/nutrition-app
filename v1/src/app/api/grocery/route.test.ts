import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

function makeRequest(body: object) {
  return new Request('http://localhost/api/grocery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

const RECIPE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('GET /api/grocery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns items mapped to camelCase ordered by checked then created_at', async () => {
    const fakeRows = [
      { id: 'g1', recipe_id: null, ingredient_name: 'Eggs', quantity: '2', unit: null, checked: false, created_at: '2026-01-01T00:00:00Z' },
      { id: 'g2', recipe_id: 'r1', ingredient_name: 'Butter', quantity: '100', unit: 'g', checked: true, created_at: '2026-01-01T00:01:00Z' },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: fakeRows, error: null }),
        }),
      }),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([
      { id: 'g1', recipeId: null, ingredientName: 'Eggs', quantity: '2', unit: null, checked: false, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'g2', recipeId: 'r1', ingredientName: 'Butter', quantity: '100', unit: 'g', checked: true, createdAt: '2026-01-01T00:01:00Z' },
    ])
  })

  it('returns empty array when no items exist', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('DB error → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB') }),
        }),
      }),
    })

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})

describe('POST /api/grocery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalid UUID → 400 BAD_REQUEST', async () => {
    const res = await POST(makeRequest({ recipeId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('missing recipeId → 400 BAD_REQUEST', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('empty ingredients list → 200 with { added: 0, merged: 0 }', async () => {
    // Call 1: recipe_ingredients → empty
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 0, merged: 0 })
  })

  it('all new ingredients → 200 with { added: 2, merged: 0 }', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'g' },
      { id: 'i2', name: 'Eggs', quantity: '2', unit: null },
    ]
    // Call 1: recipe_ingredients
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    // Call 2: existing grocery_items (none)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    // Calls 3 & 4: insert each ingredient
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 2, merged: 0 })
  })

  it('one matching unchecked item → 200 with { added: 1, merged: 1 }', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'g' },
      { id: 'i2', name: 'Eggs', quantity: '2', unit: null },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: 'Butter', quantity: '50' },
    ]
    // Call 1: recipe_ingredients
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    // Call 2: existing grocery_items
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    // Call 3: update Butter (merge)
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // Call 4: insert Eggs
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 1, merged: 1 })
  })

  it('DB error on fetch ingredients → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    })
    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })

  it('merges quantities numerically (50 + 100 = 150)', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'g' },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: 'Butter', quantity: '50' },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    const mockUpdate = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValueOnce({
      update: mockUpdate,
      eq: mockEq,
    })

    await POST(makeRequest({ recipeId: RECIPE_ID }))

    expect(mockUpdate).toHaveBeenCalledWith({ quantity: '150' })
  })

  it('case-insensitive merge (BUTTER matches butter)', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'BUTTER', quantity: '100', unit: 'g' },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: 'butter', quantity: '50' },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 0, merged: 1 })
  })

  it('DB error on fetch grocery items → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ id: 'i1', name: 'Salt', quantity: null, unit: null }], error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    })
    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })

  // P-1: within-recipe duplicate ingredient names
  it('within-recipe duplicate ingredient names → deduplicated, inserted once with combined quantity', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'g' },
      { id: 'i2', name: 'Butter', quantity: '50', unit: 'g' },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert: mockInsert })

    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 1, merged: 0 })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ingredient_name: 'Butter', quantity: '150' })
    )
  })

  // P-3: unit mismatch → retain existing, no numeric sum
  it('unit mismatch on merge → retains existing quantity without summing', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'tbsp' },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: 'Butter', quantity: '2', unit: 'cups' },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    const mockUpdate = vi.fn().mockReturnThis()
    mockFrom.mockReturnValueOnce({ update: mockUpdate, eq: vi.fn().mockResolvedValue({ error: null }) })

    await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(mockUpdate).toHaveBeenCalledWith({ quantity: '2' })
  })

  // P-4: null ingredient name → skipped gracefully
  it('ingredient with null name is skipped, remaining ingredients are processed', async () => {
    const fakeIngredients = [
      { id: 'i1', name: null, quantity: '1', unit: null },
      { id: 'i2', name: 'Eggs', quantity: '2', unit: null },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    mockFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 1, merged: 0 })
  })

  // P-5: null ingredient_name in existing grocery row → skipped, no crash
  it('existing grocery item with null ingredient_name is skipped without crashing', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'g' },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: null, quantity: '50', unit: null },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    mockFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 1, merged: 0 })
  })

  // P-6: JSON null body → 422
  it('JSON null body → 422 VALIDATION_ERROR', async () => {
    const req = new Request('http://localhost/api/grocery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    }) as import('next/server').NextRequest
    const res = await POST(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  // P-8: quantity string with unit suffix → not summed numerically
  it('quantity string with unit suffix ("50 grams") is not summed numerically', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100 grams', unit: null },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: 'Butter', quantity: '50 grams', unit: null },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    const mockUpdate = vi.fn().mockReturnThis()
    mockFrom.mockReturnValueOnce({ update: mockUpdate, eq: vi.fn().mockResolvedValue({ error: null }) })

    await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(mockUpdate).toHaveBeenCalledWith({ quantity: '50 grams' })
  })

  // P-9: "Infinity" quantity → not summed, retains existing
  it('quantity "Infinity" is not summed, retains existing', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: 'Infinity', unit: null },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: 'Butter', quantity: '50', unit: null },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    const mockUpdate = vi.fn().mockReturnThis()
    mockFrom.mockReturnValueOnce({ update: mockUpdate, eq: vi.fn().mockResolvedValue({ error: null }) })

    await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(mockUpdate).toHaveBeenCalledWith({ quantity: '50' })
  })

  // IG-1: merge must not update recipe_id
  it('merge updates only quantity, does not set recipe_id on existing grocery item', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'g' },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: 'Butter', quantity: '50', unit: 'g' },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    const mockUpdate = vi.fn().mockReturnThis()
    mockFrom.mockReturnValueOnce({ update: mockUpdate, eq: vi.fn().mockResolvedValue({ error: null }) })

    await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(mockUpdate).toHaveBeenCalledWith({ quantity: '150' })
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipe_id: expect.anything() })
    )
  })
})
