import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

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

describe('POST /api/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
