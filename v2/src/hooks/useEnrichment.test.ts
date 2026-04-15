import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useEnrichment } from './useEnrichment'

// ─── Supabase mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => {
  const from = vi.fn()
  return { supabase: { from } }
})

import { supabase } from '@/lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a chainable Supabase query builder mock.
 * `.update()` returns `this`; `.eq()` returns a promise that resolves/rejects
 * based on the provided factory, allowing `Promise.allSettled` to work correctly.
 */
function makeBuilder(eqResult: () => Promise<{ data: null; error: null }> = () =>
  Promise.resolve({ data: null, error: null })
) {
  const p = Promise.resolve({ data: null, error: null })
  const builder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(() => eqResult()),
    // Thenable interface so the builder itself can be awaited (matches Supabase client)
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return builder
}

/**
 * Wire `supabase.from` to return a fresh builder per call, tracking each one.
 * Prevents the shared-instance footgun where photoWrites and macroWrites
 * interleave calls on the same mock object.
 */
function makeFromMock(eqResult?: () => Promise<{ data: null; error: null }>) {
  const builders: ReturnType<typeof makeBuilder>[] = []
  const impl = () => {
    const b = makeBuilder(eqResult)
    builders.push(b)
    return b as ReturnType<typeof makeBuilder> & { from: unknown }
  }
  vi.mocked(supabase.from).mockImplementation(impl as unknown as typeof supabase.from)
  return builders
}

/** Collect all `.update()` call args across every builder created by makeFromMock. */
function allUpdateCalls(builders: ReturnType<typeof makeBuilder>[]) {
  return builders.flatMap((b) => b.update.mock.calls as Array<[Record<string, unknown>]>)
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DISH_ID = 'dish-abc'
const RECIPE_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
const SCAN_KEY = 'plately_scan_test_3_6'

const SCAN_DATA = {
  allDishes: [{ id: DISH_ID, name: 'Pad Thai', description: 'Classic noodles' }],
  restaurantName: 'Thai Garden',
}

const ENRICHED_DISH = {
  id: DISH_ID,
  name: 'Pad Thai',
  servings: 1,
  ingredients: [],
  photoUrl: 'https://example.com/pad-thai.jpg',
  totalCalories: 520,
  totalProtein: 25,
  totalFat: 14,
  totalCarbs: 48,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useEnrichment macro writes', () => {
  beforeEach(() => {
    sessionStorage.setItem(SCAN_KEY, JSON.stringify(SCAN_DATA))
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { dishes: [ENRICHED_DISH] } }),
    })
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.resetAllMocks()
  })

  it('writes total_protein_g, total_carbs_g, total_fat_g to Supabase after enrichment', async () => {
    const builders = makeFromMock()

    const { result } = renderHook(() => useEnrichment(), { wrapper: createWrapper() })

    act(() => {
      result.current.enrich(SCAN_KEY, { [DISH_ID]: RECIPE_UUID })
    })

    await waitFor(() => {
      const macroCall = allUpdateCalls(builders).find(([fields]) => 'total_protein_g' in fields)
      expect(macroCall).toBeDefined()
      expect(macroCall![0]).toMatchObject({
        estimated_calories: 520,
        total_protein_g: 25,
        total_carbs_g: 48,
        total_fat_g: 14,
      })
    })
  })

  it('writes estimated_calories to Supabase alongside macros', async () => {
    const builders = makeFromMock()

    const { result } = renderHook(() => useEnrichment(), { wrapper: createWrapper() })

    act(() => {
      result.current.enrich(SCAN_KEY, { [DISH_ID]: RECIPE_UUID })
    })

    await waitFor(() => {
      const macroCall = allUpdateCalls(builders).find(([fields]) => 'total_protein_g' in fields)
      expect(macroCall).toBeDefined()
      expect(macroCall![0].estimated_calories).toBe(520)
    })
  })

  it('always writes total_fibre_g as null (fibre not yet in enrich API response)', async () => {
    const builders = makeFromMock()

    const { result } = renderHook(() => useEnrichment(), { wrapper: createWrapper() })

    act(() => {
      result.current.enrich(SCAN_KEY, { [DISH_ID]: RECIPE_UUID })
    })

    await waitFor(() => {
      const macroCall = allUpdateCalls(builders).find(([fields]) => 'total_protein_g' in fields)
      expect(macroCall).toBeDefined()
      expect(macroCall![0].total_fibre_g).toBeNull()
    })
  })

  it('skips macro write for dishes with all-null macro values (P2 null guard)', async () => {
    const nullMacroDish = { ...ENRICHED_DISH, totalCalories: null, totalProtein: null, totalFat: null, totalCarbs: null }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { dishes: [nullMacroDish] } }),
    })
    const builders = makeFromMock()

    const { result } = renderHook(() => useEnrichment(), { wrapper: createWrapper() })

    act(() => {
      result.current.enrich(SCAN_KEY, { [DISH_ID]: RECIPE_UUID })
    })

    await waitFor(() => {
      expect(result.current.isEnriching).toBe(false)
    })

    // Photo write may still occur (dish has a photoUrl); macro write must NOT
    const macroCalls = allUpdateCalls(builders).filter(([fields]) => 'total_protein_g' in fields)
    expect(macroCalls).toHaveLength(0)
  })

  it('uses Promise.allSettled — Supabase write failure does not prevent hook from completing', async () => {
    // eq always rejects — simulates a DB write error for every dish
    makeFromMock(() => Promise.reject(new Error('DB write failed')))

    const { result } = renderHook(() => useEnrichment(), { wrapper: createWrapper() })

    act(() => {
      result.current.enrich(SCAN_KEY, { [DISH_ID]: RECIPE_UUID })
    })

    // Hook must complete (isEnriching → false) even when all writes fail.
    // If Promise.all were used instead of Promise.allSettled, the rejection would
    // propagate and isEnriching might stay true (or the outer catch would swallow it).
    await waitFor(() => {
      expect(result.current.isEnriching).toBe(false)
    })
  })

  it('does not call Supabase when dishToRecipeMap is null', async () => {
    makeFromMock()

    const { result } = renderHook(() => useEnrichment(), { wrapper: createWrapper() })

    act(() => {
      result.current.enrich(SCAN_KEY, null)
    })

    await waitFor(() => {
      expect(result.current.isEnriching).toBe(false)
    })

    // No Supabase writes should occur when map is null
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('does not call Supabase when dishToRecipeMap is empty', async () => {
    makeFromMock()

    const { result } = renderHook(() => useEnrichment(), { wrapper: createWrapper() })

    act(() => {
      result.current.enrich(SCAN_KEY, {})
    })

    await waitFor(() => {
      expect(result.current.isEnriching).toBe(false)
    })

    expect(supabase.from).not.toHaveBeenCalled()
  })
})
