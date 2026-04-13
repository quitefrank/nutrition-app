import { vi, describe, it, expect, beforeEach } from 'vitest'

// ─── Supabase mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => {
  const from = vi.fn()
  return { supabase: { from } }
})

import { supabase } from '@/lib/supabase'
import { getCachedMenu, cacheMenu } from './menuCache'

// ─── Builder factory ──────────────────────────────────────────────────────────

function makeBuilder(result: { data?: unknown; error?: { message: string } | null }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const p = Promise.resolve(resolved)
  const b = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolved)),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return b
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-13T12:00:00Z').getTime()
const FRESH_DATE = new Date(NOW - 1000 * 60 * 60).toISOString()      // 1 hour ago — within TTL
const STALE_DATE = new Date(NOW - 31 * 24 * 60 * 60 * 1000).toISOString() // 31 days ago — expired

const RESTAURANT_ID = 'rest-uuid-123'
const VISIT_ID = 'visit-uuid-456'
const VALID_DISHES_JSON = JSON.stringify([
  { name: 'Pad Thai', description: 'Stir-fried noodles', calorieEstimate: 480 },
  { name: 'Green Curry', description: null, calorieEstimate: null },
])

// ─── getCachedMenu ─────────────────────────────────────────────────────────────

describe('getCachedMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(NOW)
  })

  it('returns null when no identifier is provided', async () => {
    const result = await getCachedMenu({})
    expect(result).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns null when the restaurant is not found by placeId', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null }) as ReturnType<typeof supabase.from>)
    const result = await getCachedMenu({ placeId: 'ChIJnonexistent' })
    expect(result).toBeNull()
  })

  it('returns null when the restaurant is not found by name', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null }) as ReturnType<typeof supabase.from>)
    const result = await getCachedMenu({ name: 'Ghost Kitchen' })
    expect(result).toBeNull()
  })

  it('returns null when no visit with a menu exists', async () => {
    // First call: restaurant lookup — returns a row
    // Second call: visit lookup — returns null
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
    })

    const result = await getCachedMenu({ placeId: 'ChIJvalid' })
    expect(result).toBeNull()
  })

  it('returns null when the cached entry is past the 30-day TTL', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      return makeBuilder({
        data: { id: VISIT_ID, raw_menu_json: VALID_DISHES_JSON, visited_at: STALE_DATE },
      }) as ReturnType<typeof supabase.from>
    })

    const result = await getCachedMenu({ placeId: 'ChIJvalid' })
    expect(result).toBeNull()
  })

  it('returns parsed dishes on a fresh cache hit by placeId', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      return makeBuilder({
        data: { id: VISIT_ID, raw_menu_json: VALID_DISHES_JSON, visited_at: FRESH_DATE },
      }) as ReturnType<typeof supabase.from>
    })

    const result = await getCachedMenu({ placeId: 'ChIJvalid' })
    expect(result).not.toBeNull()
    expect(result!.restaurantId).toBe(RESTAURANT_ID)
    expect(result!.dishes).toHaveLength(2)
    expect(result!.dishes[0].name).toBe('Pad Thai')
    expect(result!.dishes[0].calorieEstimate).toBe(480)
    expect(result!.dishes[1].name).toBe('Green Curry')
    expect(result!.dishes[1].calorieEstimate).toBeNull()
  })

  it('falls back to name lookup when placeId yields no restaurant row', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      // 1st = placeId lookup → null
      if (callCount === 1) return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
      // 2nd = name lookup → found
      if (callCount === 2) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      // 3rd = visit lookup → fresh hit
      return makeBuilder({
        data: { id: VISIT_ID, raw_menu_json: VALID_DISHES_JSON, visited_at: FRESH_DATE },
      }) as ReturnType<typeof supabase.from>
    })

    const result = await getCachedMenu({ placeId: 'ChIJmissing', name: 'Thai Palace' })
    expect(result).not.toBeNull()
    expect(result!.dishes).toHaveLength(2)
  })

  it('returns null when raw_menu_json is malformed', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      return makeBuilder({
        data: { id: VISIT_ID, raw_menu_json: 'NOT_VALID_JSON{{{', visited_at: FRESH_DATE },
      }) as ReturnType<typeof supabase.from>
    })

    const result = await getCachedMenu({ placeId: 'ChIJvalid' })
    expect(result).toBeNull()
  })

  it('returns null when raw_menu_json is an object (not an array)', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      return makeBuilder({
        data: { id: VISIT_ID, raw_menu_json: JSON.stringify({ not: 'an array' }), visited_at: FRESH_DATE },
      }) as ReturnType<typeof supabase.from>
    })

    const result = await getCachedMenu({ placeId: 'ChIJvalid' })
    expect(result).toBeNull()
  })

  it('filters out dishes with empty names', async () => {
    const withEmptyName = JSON.stringify([
      { name: '', description: 'invisible dish' },
      { name: '   ', description: 'also invisible' },
      { name: 'Visible Dish', calorieEstimate: 300 },
    ])
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      return makeBuilder({
        data: { id: VISIT_ID, raw_menu_json: withEmptyName, visited_at: FRESH_DATE },
      }) as ReturnType<typeof supabase.from>
    })

    const result = await getCachedMenu({ placeId: 'ChIJvalid' })
    expect(result).not.toBeNull()
    expect(result!.dishes).toHaveLength(1)
    expect(result!.dishes[0].name).toBe('Visible Dish')
  })

  it('returns null and does not throw when Supabase throws', async () => {
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('network error')
    })

    await expect(getCachedMenu({ placeId: 'ChIJvalid' })).resolves.toBeNull()
  })
})

// ─── cacheMenu ─────────────────────────────────────────────────────────────────

describe('cacheMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the most recent visit row with the dishes JSON', async () => {
    const updateMock = vi.fn(() => Promise.resolve({ data: null, error: null }))
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      single: vi.fn(() => Promise.resolve({ data: { id: VISIT_ID }, error: null })),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as ReturnType<typeof supabase.from>)

    await expect(cacheMenu(RESTAURANT_ID, VALID_DISHES_JSON)).resolves.toBeUndefined()
    expect(supabase.from).toHaveBeenCalledWith('restaurant_visits')
  })

  it('inserts a new visit row when none exists', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First call: lookup most recent visit — no row
        const b = makeBuilder({ data: null })
        return b as ReturnType<typeof supabase.from>
      }
      // Second call: insert
      return makeBuilder({ data: { id: 'new-visit' }, error: null }) as ReturnType<typeof supabase.from>
    })

    await expect(cacheMenu(RESTAURANT_ID, VALID_DISHES_JSON)).resolves.toBeUndefined()
    expect(callCount).toBe(2)
  })

  it('does not throw when Supabase errors', async () => {
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('db error')
    })

    await expect(cacheMenu(RESTAURANT_ID, VALID_DISHES_JSON)).resolves.toBeUndefined()
  })
})
