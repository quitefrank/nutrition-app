import { vi, describe, it, expect, beforeEach } from 'vitest'

// ─── Supabase mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => {
  const from = vi.fn()
  return { supabase: { from } }
})

import { supabase } from '@/lib/supabase'
import { autoSaveToSupabase } from './supabaseAutoSave'

// ─── Builder factory ──────────────────────────────────────────────────────────

function makeBuilder(result: { data?: unknown; error?: { message: string } | null }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const p = Promise.resolve(resolved)
  const b = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolved)),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return b
}

// ─── Test data ─────────────────────────────────────────────────────────────────

const SCAN_KEY = 'plately_scan_test-key'
const RESTAURANT_ID = 'rest-uuid-001'
const VISIT_ID = 'visit-uuid-001'
const RECIPE_ID = 'recipe-uuid-001'
const DISH_ID = 'dish-gemini-001'

const minimalScan = {
  restaurantName: 'Spice Garden',
  restaurantPlaceId: 'ChIJ_test_place',
  allDishes: [
    {
      id: DISH_ID,
      name: 'Butter Chicken',
      description: 'Rich tomato curry',
      calorieEstimate: 520,
      confidence: 0.9,
      ingredients: [
        { name: 'Chicken', quantity: '200', unit: 'g', confidenceLevel: 'high', calories_kcal: 300 },
      ],
    },
  ],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedSessionStorage(key: string, value: unknown) {
  sessionStorage.setItem(key, JSON.stringify(value))
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('autoSaveToSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('returns null when the sessionStorage key is absent', async () => {
    const result = await autoSaveToSupabase('missing-key')
    expect(result).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns null when the stored scan has no dishes', async () => {
    seedSessionStorage(SCAN_KEY, { restaurantName: 'Empty', allDishes: [] })
    const result = await autoSaveToSupabase(SCAN_KEY)
    expect(result).toBeNull()
  })

  it('returns null when sessionStorage contains malformed JSON', async () => {
    sessionStorage.setItem(SCAN_KEY, 'NOT_VALID_JSON{{{')
    const result = await autoSaveToSupabase(SCAN_KEY)
    expect(result).toBeNull()
  })

  it('happy path: returns a dish-to-recipe map on success', async () => {
    seedSessionStorage(SCAN_KEY, minimalScan)

    let callCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      callCount++
      if (table === 'restaurants') {
        // First restaurants call: look up by place_id — found
        if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'restaurant_visits') {
        return makeBuilder({ data: { id: VISIT_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'recipes') {
        // Dedup check: no existing recipe
        if (callCount === 3) return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
        // Insert: returns new recipe
        return makeBuilder({ data: { id: RECIPE_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'recipe_ingredients') {
        return makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
      }
      return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
    })

    const dispatched: CustomEvent[] = []
    window.addEventListener('plately:supabase-saved', (e) => dispatched.push(e as CustomEvent))

    const result = await autoSaveToSupabase(SCAN_KEY)

    expect(result).not.toBeNull()
    expect(Object.keys(result!)).toHaveLength(1)
    expect(result![DISH_ID]).toBeDefined()
  })

  it('dispatches plately:supabase-saved with the first recipe id', async () => {
    seedSessionStorage(SCAN_KEY, minimalScan)

    let callCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      callCount++
      if (table === 'restaurants') {
        if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'restaurant_visits') return makeBuilder({ data: { id: VISIT_ID } }) as ReturnType<typeof supabase.from>
      if (table === 'recipes') {
        if (callCount === 3) return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
        return makeBuilder({ data: { id: RECIPE_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'recipe_ingredients') return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
      return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
    })

    const events: CustomEvent[] = []
    window.addEventListener('plately:supabase-saved', (e) => events.push(e as CustomEvent), { once: true })

    await autoSaveToSupabase(SCAN_KEY)

    expect(events).toHaveLength(1)
    expect(events[0].detail.scanKey).toBe(SCAN_KEY)
    expect(events[0].detail.recipeId).toBeDefined()
  })

  it('reuses an existing recipe row when the same dish name exists at the restaurant', async () => {
    seedSessionStorage(SCAN_KEY, minimalScan)

    const EXISTING_RECIPE_ID = 'existing-recipe-uuid'
    let callCount = 0

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      callCount++
      if (table === 'restaurants') {
        if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'restaurant_visits') return makeBuilder({ data: { id: VISIT_ID } }) as ReturnType<typeof supabase.from>
      if (table === 'recipes') {
        // Dedup check returns an existing recipe
        return makeBuilder({ data: { id: EXISTING_RECIPE_ID, dish_image_url: null } }) as ReturnType<typeof supabase.from>
      }
      return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
    })

    const result = await autoSaveToSupabase(SCAN_KEY)
    expect(result![DISH_ID]).toBe(EXISTING_RECIPE_ID)
  })

  it('falls back to name-based insert when no placeId is present', async () => {
    const noPlaceIdScan = { ...minimalScan, restaurantPlaceId: null }
    seedSessionStorage(SCAN_KEY, noPlaceIdScan)

    let callCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      callCount++
      if (table === 'restaurants') {
        // Insert by name → success
        if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'restaurant_visits') return makeBuilder({ data: { id: VISIT_ID } }) as ReturnType<typeof supabase.from>
      if (table === 'recipes') {
        if (callCount === 3) return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
        return makeBuilder({ data: { id: RECIPE_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'recipe_ingredients') return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
      return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
    })

    const result = await autoSaveToSupabase(SCAN_KEY)
    expect(result).not.toBeNull()
  })

  it('suppresses photo_status for low-confidence dishes (< 0.3)', async () => {
    const lowConfidenceScan = {
      ...minimalScan,
      allDishes: [{ ...minimalScan.allDishes[0], confidence: 0.1 }],
    }
    seedSessionStorage(SCAN_KEY, lowConfidenceScan)

    const insertedRecipes: unknown[] = []
    let callCount = 0

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      callCount++
      if (table === 'restaurants') {
        if (callCount === 1) return makeBuilder({ data: { id: RESTAURANT_ID } }) as ReturnType<typeof supabase.from>
      }
      if (table === 'restaurant_visits') return makeBuilder({ data: { id: VISIT_ID } }) as ReturnType<typeof supabase.from>
      if (table === 'recipes') {
        if (callCount === 3) return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
        // Capture what was inserted
        const b = makeBuilder({ data: { id: RECIPE_ID } })
        const origInsert = b.insert.bind(b)
        b.insert = vi.fn((payload: unknown) => {
          insertedRecipes.push(payload)
          return origInsert(payload)
        })
        return b as ReturnType<typeof supabase.from>
      }
      if (table === 'recipe_ingredients') return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
      return makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
    })

    await autoSaveToSupabase(SCAN_KEY)

    // The recipe insert should have set photo_status to 'suppressed'
    const recipePayload = insertedRecipes[0] as Record<string, unknown>
    expect(recipePayload?.photo_status).toBe('suppressed')
  })

  it('does not throw and returns null when Supabase errors', async () => {
    seedSessionStorage(SCAN_KEY, minimalScan)
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('unexpected db error')
    })

    await expect(autoSaveToSupabase(SCAN_KEY)).resolves.toBeNull()
  })
})
