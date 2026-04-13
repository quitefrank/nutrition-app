import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() => vi.fn(() => ({
  places: 'mock-places-key' as string | undefined,
  gemini: 'mock-gemini-key',
})))

const mockGetRestaurantPhotos = vi.hoisted(() => vi.fn().mockResolvedValue([
  'https://places.googleapis.com/photo1',
  'https://places.googleapis.com/photo2',
]))

// Supabase method mocks — kept at hoisted scope so they can be inspected in assertions
const mockInsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const mockMaybeSingle = vi.hoisted(() => vi.fn().mockResolvedValue({
  data: { id: '11111111-2222-3333-8444-555555555555' },
  error: null,
}))

// Terminal mock for the recipes SELECT query: .neq() ends the chain
const mockNeq = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [], error: null }))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@/lib/placesPhotos', () => ({ getRestaurantPhotos: mockGetRestaurantPhotos }))

vi.mock('@/lib/supabase', () => {
  // Return a fresh builder on each from() call so chains for different tables
  // don't share method-call history (P-11 fix).
  function makeBuilder() {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      neq: mockNeq,
      maybeSingle: mockMaybeSingle,
      insert: mockInsert,
    }
  }
  return {
    supabase: {
      from: vi.fn().mockImplementation(makeBuilder),
    },
  }
})

// Mock global fetch (used for /api/scan self-calls inside the route)
global.fetch = vi.fn()

import { POST } from './route'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Valid UUID used as the test restaurantId throughout. */
const TEST_RESTAURANT_ID = '11111111-2222-3333-8444-555555555555'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/places/recover-menu', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Stub a successful scan response returning the given dish names. */
function scanOk(names: string[]) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      data: { dishes: names.map((name) => ({ name, description: '', calorieEstimate: null })) },
    }),
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/places/recover-menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetApiKeys.mockReturnValue({ places: 'mock-places-key', gemini: 'mock-gemini-key' })
    mockGetRestaurantPhotos.mockResolvedValue([
      'https://places.googleapis.com/photo1',
      'https://places.googleapis.com/photo2',
    ])

    // Default: no existing dishes; insert succeeds
    mockNeq.mockResolvedValue({ data: [], error: null })
    mockInsert.mockResolvedValue({ error: null })
    mockMaybeSingle.mockResolvedValue({ data: { id: TEST_RESTAURANT_ID }, error: null })

    // Default scan: empty dishes
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { dishes: [] } }),
    } as unknown as Response)
  })

  // ─── Validation ─────────────────────────────────────────────────────────────

  it('returns 422 when placeId is missing', async () => {
    const res = await POST(makeReq({ restaurantId: TEST_RESTAURANT_ID }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 503 when Places API key is not configured', async () => {
    mockGetApiKeys.mockReturnValue({ places: undefined, gemini: 'mock-gemini-key' })
    const res = await POST(makeReq({ placeId: 'ChIJabc123', restaurantId: TEST_RESTAURANT_ID }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('PLACES_UNAVAILABLE')
  })

  // ─── Zero-result paths ───────────────────────────────────────────────────────

  it('returns { data: { newDishCount: 0 } } when Places returns no photos', async () => {
    mockGetRestaurantPhotos.mockResolvedValue([])
    const res = await POST(makeReq({ placeId: 'ChIJabc123', restaurantId: TEST_RESTAURANT_ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { newDishCount: 0 } })
  })

  it('returns { data: { newDishCount: 0 } } when all Gemini scans return empty dishes', async () => {
    // Default mock already returns empty dishes
    const res = await POST(makeReq({ placeId: 'ChIJabc123', restaurantId: TEST_RESTAURANT_ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { newDishCount: 0 } })
  })

  // ─── Happy path ──────────────────────────────────────────────────────────────

  it('inserts new dishes and returns correct newDishCount when recovery finds dishes', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(scanOk(['Pad Thai', 'Tom Yum']) as unknown as Response)
      .mockResolvedValueOnce(scanOk(['Green Curry']) as unknown as Response)

    const res = await POST(makeReq({ placeId: 'ChIJabc123', restaurantId: TEST_RESTAURANT_ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { newDishCount: 3 } })
    expect(mockInsert).toHaveBeenCalledOnce()
    const insertArg = mockInsert.mock.calls[0][0] as Array<{ name: string }>
    expect(insertArg.map((r) => r.name)).toEqual(['Pad Thai', 'Tom Yum', 'Green Curry'])
  })

  // ─── Deduplication ───────────────────────────────────────────────────────────

  it('deduplicates against existing Supabase recipes (case-insensitive, trimmed)', async () => {
    // Existing row: 'pad thai' in Supabase → should be excluded from insert
    mockNeq.mockResolvedValueOnce({ data: [{ name: 'pad thai' }], error: null })

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(scanOk(['Pad Thai', 'Tom Yum']) as unknown as Response)
      .mockResolvedValueOnce(scanOk([]) as unknown as Response)

    const res = await POST(makeReq({ placeId: 'ChIJabc123', restaurantId: TEST_RESTAURANT_ID }))
    expect(await res.json()).toEqual({ data: { newDishCount: 1 } })
    const insertArg = mockInsert.mock.calls[0][0] as Array<{ name: string }>
    expect(insertArg.map((r) => r.name)).toEqual(['Tom Yum'])
  })

  it('deduplicates within the same batch (same dish found in two photos)', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(scanOk(['Pad Thai']) as unknown as Response)
      .mockResolvedValueOnce(scanOk(['pad thai ']) as unknown as Response)  // duplicate casing/whitespace

    const res = await POST(makeReq({ placeId: 'ChIJabc123', restaurantId: TEST_RESTAURANT_ID }))
    expect(await res.json()).toEqual({ data: { newDishCount: 1 } })
    const insertArg = mockInsert.mock.calls[0][0] as Array<{ name: string }>
    expect(insertArg).toHaveLength(1)
    expect(insertArg[0].name).toBe('Pad Thai')
  })

  it('skips dishes with status "removed" in deduplication check', async () => {
    // .neq('status', 'removed') means removed dishes are excluded from existingNames,
    // so they CAN be re-inserted. Verify the query uses .neq() AND the dish is inserted.
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(scanOk(['Previously Removed Dish']) as unknown as Response)
      .mockResolvedValueOnce(scanOk([]) as unknown as Response)

    const res = await POST(makeReq({ placeId: 'ChIJabc123', restaurantId: TEST_RESTAURANT_ID }))
    expect(await res.json()).toEqual({ data: { newDishCount: 1 } })
    expect(mockNeq).toHaveBeenCalledWith('status', 'removed')
    expect(mockInsert).toHaveBeenCalledOnce()
    const insertArg = mockInsert.mock.calls[0][0] as Array<{ name: string }>
    expect(insertArg[0].name).toBe('Previously Removed Dish')
  })

  // ─── Silent failure paths ────────────────────────────────────────────────────

  it('returns newDishCount: 0 and does not throw when Places API throws a network error', async () => {
    mockGetRestaurantPhotos.mockRejectedValueOnce(new Error('Network error'))
    // No restaurantId provided — route looks it up via Supabase before hitting Photos
    const res = await POST(makeReq({ placeId: 'ChIJabc123' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { newDishCount: 0 } })
  })

  it('returns newDishCount: 0 (silent) when Supabase insert fails', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(scanOk(['Pad Thai']) as unknown as Response)
      .mockResolvedValueOnce(scanOk([]) as unknown as Response)

    mockInsert.mockResolvedValueOnce({ error: { message: 'DB error' } })

    const res = await POST(makeReq({ placeId: 'ChIJabc123', restaurantId: TEST_RESTAURANT_ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { newDishCount: 0 } })
  })
})
