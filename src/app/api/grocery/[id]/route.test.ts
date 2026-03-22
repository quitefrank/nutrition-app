import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PUT, DELETE } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

const ITEM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePutRequest(body: object) {
  return new Request(`http://localhost/api/grocery/${ITEM_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

function makeDeleteRequest() {
  return new Request(`http://localhost/api/grocery/${ITEM_ID}`, {
    method: 'DELETE',
  }) as import('next/server').NextRequest
}

describe('PUT /api/grocery/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalid UUID → 400 BAD_REQUEST', async () => {
    const res = await PUT(makePutRequest({ checked: true }), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('checked not boolean → 422 VALIDATION_ERROR', async () => {
    const res = await PUT(makePutRequest({ checked: 'yes' }), makeParams(ITEM_ID))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('invalid JSON body → 422 VALIDATION_ERROR', async () => {
    const req = new Request(`http://localhost/api/grocery/${ITEM_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    }) as import('next/server').NextRequest
    const res = await PUT(req, makeParams(ITEM_ID))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('updates checked=true → 200 with { id, checked: true }', async () => {
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: ITEM_ID }], error: null }),
    })
    const res = await PUT(makePutRequest({ checked: true }), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: ITEM_ID, checked: true })
  })

  it('updates checked=false → 200 with { id, checked: false }', async () => {
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: ITEM_ID }], error: null }),
    })
    const res = await PUT(makePutRequest({ checked: false }), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: ITEM_ID, checked: false })
  })

  it('item not found → 404 NOT_FOUND', async () => {
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const res = await PUT(makePutRequest({ checked: true }), makeParams(ITEM_ID))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('DB error → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('DB') }),
    })
    const res = await PUT(makePutRequest({ checked: false }), makeParams(ITEM_ID))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})

describe('DELETE /api/grocery/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalid UUID → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('deletes row → 200 with { deleted: true }', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: ITEM_ID }], error: null }),
    })
    const res = await DELETE(makeDeleteRequest(), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ deleted: true })
  })

  it('item not found → 404 NOT_FOUND', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const res = await DELETE(makeDeleteRequest(), makeParams(ITEM_ID))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('DB error → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('DB') }),
    })
    const res = await DELETE(makeDeleteRequest(), makeParams(ITEM_ID))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})
