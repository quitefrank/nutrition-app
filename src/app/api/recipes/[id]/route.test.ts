import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE, GET, PUT } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

function makeDeleteRequest(id: string) {
  return new Request(`http://localhost/api/recipes/${id}`, { method: 'DELETE' })
}

function makeGetRequest(id: string) {
  return new Request(`http://localhost/api/recipes/${id}`, { method: 'GET' }) as import('next/server').NextRequest
}

describe('DELETE /api/recipes/[id]', () => {
  const DELETE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const MISSING_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invalid UUID → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeDeleteRequest('not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('success: returns 200 with deleted: true when recipe exists', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    })

    const res = await DELETE(makeDeleteRequest(DELETE_ID), { params: Promise.resolve({ id: DELETE_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(true)
  })

  it('not found: returns 404 when count is 0', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 0 }),
    })

    const res = await DELETE(makeDeleteRequest(MISSING_ID), { params: Promise.resolve({ id: MISSING_ID }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('DB error: returns 500', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: new Error('DB error'), count: null }),
    })

    const res = await DELETE(makeDeleteRequest(DELETE_ID), { params: Promise.resolve({ id: DELETE_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})

describe('GET /api/recipes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const RECIPE_ID_1 = '11111111-1111-1111-1111-111111111111'
  const RECIPE_ID_2 = '22222222-2222-2222-2222-222222222222'
  const NOT_FOUND_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

  it('success: returns 200 with recipe + camelCase mapping', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        error: null,
        data: {
          id: RECIPE_ID_1,
          name: 'Duck Confit',
          restaurant_id: null,
          dish_image_url: null,
          confidence_metadata_json: null,
          serving_size: 1,
          created_at: '2026-03-22T00:00:00Z',
          restaurants: null,
          recipe_ingredients: [
            {
              id: 'ing-1',
              recipe_id: RECIPE_ID_1,
              name: 'Duck leg',
              quantity: '2',
              unit: 'pcs',
              confidence_level: 'high',
              calories_kcal: null,
              protein_g: null,
              fat_g: null,
              carbs_g: null,
            },
          ],
        },
      }),
    })

    const res = await GET(makeGetRequest(RECIPE_ID_1), { params: Promise.resolve({ id: RECIPE_ID_1 }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(RECIPE_ID_1)
    expect(body.data.ingredients).toHaveLength(1)
    expect(body.data.ingredients[0].confidenceLevel).toBe('high')
    expect(body.data.ingredients[0].recipeId).toBe(RECIPE_ID_1)
  })

  it('success: maps restaurant to camelCase when present', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        error: null,
        data: {
          id: RECIPE_ID_2,
          name: 'Ramen',
          restaurant_id: NOT_FOUND_ID,
          dish_image_url: null,
          confidence_metadata_json: null,
          serving_size: 1,
          created_at: '2026-03-22T00:00:00Z',
          restaurants: { id: NOT_FOUND_ID, name: 'Ichiran', google_places_id: 'gp-1', atmospheric_palette_json: null, updated_at: '2026-03-22T00:00:00Z' },
          recipe_ingredients: [],
        },
      }),
    })

    const res = await GET(makeGetRequest(RECIPE_ID_2), { params: Promise.resolve({ id: RECIPE_ID_2 }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.restaurant.name).toBe('Ichiran')
    expect(body.data.restaurant.googlePlacesId).toBe('gp-1')
  })

  it('not found: PGRST116 → 404', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ error: { code: 'PGRST116', message: 'not found' }, data: null }),
    })

    const res = await GET(makeGetRequest(NOT_FOUND_ID), { params: Promise.resolve({ id: NOT_FOUND_ID }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('DB error: non-PGRST116 → 500', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ error: { code: '500', message: 'DB error' }, data: null }),
    })

    const res = await GET(makeGetRequest(RECIPE_ID_1), { params: Promise.resolve({ id: RECIPE_ID_1 }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})

describe('PUT /api/recipes/[id]', () => {
  const RECIPE_ID = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makePutRequest(id: string, body: object) {
    return new Request(`http://localhost/api/recipes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as import('next/server').NextRequest
  }

  const validPayload = {
    name: 'Updated Duck Confit',
    servingSize: 2,
    ingredients: [{ id: 'ing-1', name: 'Duck leg', quantity: '4', unit: 'pcs', confidenceLevel: 'high' }],
  }

  it('success: returns 200 with updated Recipe', async () => {
    // Call 1: UPDATE recipes
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // Call 2: UPDATE recipe_ingredients (one ingredient) — needs two chained .eq() calls
    const ingUpdateMock = { update: vi.fn().mockReturnThis(), eq: vi.fn() }
    ingUpdateMock.eq.mockReturnValueOnce(ingUpdateMock).mockResolvedValueOnce({ error: null })
    mockFrom.mockReturnValueOnce(ingUpdateMock)
    // Call 3: re-query GET
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        error: null,
        data: {
          id: RECIPE_ID,
          name: 'Updated Duck Confit',
          restaurant_id: null,
          dish_image_url: null,
          confidence_metadata_json: null,
          serving_size: 2,
          created_at: '2026-03-22T00:00:00Z',
          restaurants: null,
          recipe_ingredients: [{
            id: 'ing-1', recipe_id: RECIPE_ID, name: 'Duck leg',
            quantity: '4', unit: 'pcs', confidence_level: 'high',
            calories_kcal: null, protein_g: null, fat_g: null, carbs_g: null,
          }],
        },
      }),
    })

    const res = await PUT(makePutRequest(RECIPE_ID, validPayload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Updated Duck Confit')
    expect(body.data.servingSize).toBe(2)
    expect(body.data.ingredients).toHaveLength(1)
    expect(body.data.ingredients[0].confidenceLevel).toBe('high')
  })

  it('invalid UUID → 400 BAD_REQUEST', async () => {
    const res = await PUT(makePutRequest('not-a-uuid', validPayload), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('validation: empty name → 422 VALIDATION_ERROR', async () => {
    const res = await PUT(makePutRequest(RECIPE_ID, { ...validPayload, name: '' }),
      { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('validation: whitespace-only name → 422 VALIDATION_ERROR', async () => {
    const res = await PUT(makePutRequest(RECIPE_ID, { ...validPayload, name: '   ' }),
      { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('validation: ingredient with empty name → 422 VALIDATION_ERROR', async () => {
    const payload = { ...validPayload, ingredients: [{ id: 'ing-1', name: '', quantity: null, unit: null, confidenceLevel: 'high' }] }
    const res = await PUT(makePutRequest(RECIPE_ID, payload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('DB error on recipe update → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: new Error('DB error') }),
    })
    const res = await PUT(makePutRequest(RECIPE_ID, validPayload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })

  it('DB error on ingredient update → 500 DB_ERROR', async () => {
    // Call 1: UPDATE recipes — success
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // Call 2: UPDATE recipe_ingredients — error
    const ingUpdateMock = { update: vi.fn().mockReturnThis(), eq: vi.fn() }
    ingUpdateMock.eq.mockReturnValueOnce(ingUpdateMock).mockResolvedValueOnce({ error: new Error('DB error') })
    mockFrom.mockReturnValueOnce(ingUpdateMock)

    const res = await PUT(makePutRequest(RECIPE_ID, validPayload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })

  it('recipe not found: returns 404 NOT_FOUND when update matches zero rows', async () => {
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 0 }),
    })
    const res = await PUT(makePutRequest(RECIPE_ID, validPayload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('ingredient not found: returns 422 when ingredient ID matches zero rows', async () => {
    // Call 1: UPDATE recipes — 1 row updated (recipe exists)
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    })
    // Call 2: UPDATE recipe_ingredients — 0 rows (ingredient not found / wrong recipe)
    const ingUpdateMock = { update: vi.fn().mockReturnThis(), eq: vi.fn() }
    ingUpdateMock.eq.mockReturnValueOnce(ingUpdateMock).mockResolvedValueOnce({ error: null, count: 0 })
    mockFrom.mockReturnValueOnce(ingUpdateMock)

    const res = await PUT(makePutRequest(RECIPE_ID, validPayload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })
})

describe('DELETE /api/recipes/[id] — grocery_items cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('success: deletes grocery_items before recipe', async () => {
    const RECIPE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const groceryEqSpy = vi.fn().mockResolvedValue({ error: null })
    const groceryDeleteMock = { delete: vi.fn().mockReturnThis(), eq: groceryEqSpy }
    const recipeDeleteMock = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    }
    mockFrom
      .mockReturnValueOnce(groceryDeleteMock)
      .mockReturnValueOnce(recipeDeleteMock)

    const res = await DELETE(makeDeleteRequest(RECIPE_ID), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(true)
    expect(groceryEqSpy).toHaveBeenCalledWith('recipe_id', RECIPE_ID)
  })

  it('grocery_items error is best-effort: recipe still deleted successfully', async () => {
    const RECIPE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const groceryDeleteMock = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: new Error('grocery_items DB error') }),
    }
    const recipeDeleteMock = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    }
    mockFrom
      .mockReturnValueOnce(groceryDeleteMock)
      .mockReturnValueOnce(recipeDeleteMock)

    const res = await DELETE(makeDeleteRequest(RECIPE_ID), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(true)
  })
})

describe('DELETE /api/recipes/[id] — param contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts id from Promise params (Next.js 15 async params)', async () => {
    const PARAM_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    const eqSpy = vi.fn().mockResolvedValue({ error: null, count: 1 })
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: eqSpy,
    })
    await DELETE(makeDeleteRequest(PARAM_ID), { params: Promise.resolve({ id: PARAM_ID }) })
    expect(eqSpy).toHaveBeenCalledWith('id', PARAM_ID)
  })
})

describe('GET /api/recipes/[id] — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for empty id', async () => {
    const res = await GET(makeGetRequest(''), { params: Promise.resolve({ id: '' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('returns 400 for non-UUID id', async () => {
    const res = await GET(makeGetRequest('not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })
})
