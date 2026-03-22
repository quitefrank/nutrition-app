import { describe, it, expect, vi, beforeEach } from 'vitest'
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].restaurant).toBeNull()
  })

  it('DB error: returns { error, code: DB_ERROR } HTTP 500', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    }))

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to fetch recipes')
    expect(body.code).toBe('DB_ERROR')
  })
})
