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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('success: returns 200 with deleted: true when recipe exists', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    })

    const res = await DELETE(makeDeleteRequest('recipe-uuid-1'), { params: Promise.resolve({ id: 'recipe-uuid-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(true)
  })

  it('not found: returns 404 when count is 0', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 0 }),
    })

    const res = await DELETE(makeDeleteRequest('nonexistent-id'), { params: Promise.resolve({ id: 'nonexistent-id' }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('DB error: returns 500', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: new Error('DB error'), count: null }),
    })

    const res = await DELETE(makeDeleteRequest('recipe-uuid-1'), { params: Promise.resolve({ id: 'recipe-uuid-1' }) })
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
  it('returns 501 Not Implemented', async () => {
    const res = await PUT()
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.code).toBe('NOT_IMPLEMENTED')
  })
})

describe('DELETE /api/recipes/[id] — param contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts id from Promise params (Next.js 15 async params)', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null, count: 1 })
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: eqSpy,
    })
    await DELETE(makeDeleteRequest('recipe-uuid-1'), { params: Promise.resolve({ id: 'recipe-uuid-1' }) })
    expect(eqSpy).toHaveBeenCalledWith('id', 'recipe-uuid-1')
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
