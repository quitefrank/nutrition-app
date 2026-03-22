import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

const RECIPE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function makeRequest(queryString: string) {
  return new Request(`http://localhost/api/grocery/bulk${queryString}`, {
    method: 'DELETE',
  }) as import('next/server').NextRequest
}

describe('DELETE /api/grocery/bulk', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no valid param → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeRequest(''))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('unknown param → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeRequest('?foo=bar'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('?checked=false → 400 BAD_REQUEST (must be "true")', async () => {
    const res = await DELETE(makeRequest('?checked=false'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('both ?checked=true and ?recipeId supplied → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeRequest(`?checked=true&recipeId=${RECIPE_ID}`))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('?checked=true → deletes checked items, returns count', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'g1' }, { id: 'g2' }], error: null }),
    })
    const res = await DELETE(makeRequest('?checked=true'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(2)
  })

  it('?checked=true with no rows → returns { deleted: 0 }', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const res = await DELETE(makeRequest('?checked=true'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(0)
  })

  it('?recipeId=<valid-uuid> → deletes recipe items, returns count', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'g3' }], error: null }),
    })
    const res = await DELETE(makeRequest(`?recipeId=${RECIPE_ID}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(1)
  })

  it('?recipeId=invalid → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeRequest('?recipeId=not-a-uuid'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('DB error on checked=true → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('DB') }),
    })
    const res = await DELETE(makeRequest('?checked=true'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })

  it('DB error on recipeId → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('DB') }),
    })
    const res = await DELETE(makeRequest(`?recipeId=${RECIPE_ID}`))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})
