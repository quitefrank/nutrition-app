import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ─── Supabase mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => {
  const from = vi.fn()
  return { supabase: { from } }
})

import { supabase } from '@/lib/supabase'
import {
  useRestaurants,
  useRestaurant,
  useRestaurantsWithRecipes,
  useUpsertRestaurant,
  useUpdateAtmosphericPalette,
} from './useRestaurants'

// ─── Builder factory ──────────────────────────────────────────────────────────

type BuilderResult = { data?: unknown; error?: { message: string } | null }

function makeBuilder(result: BuilderResult) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const p = Promise.resolve(resolved)
  const b = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolved)),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return b
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rawRestaurant(id = 'rest-1', name = 'Spice Garden') {
  return {
    id,
    name,
    place_id: null,
    address: null,
    cuisine_type: null,
    reference_image_url: null,
    atmospheric_palette_json: null,
    rating: null,
    user_ratings_total: null,
    created_at: new Date().toISOString(),
  }
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    qc,
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children),
  }
}

// ─── useRestaurants ────────────────────────────────────────────────────────────

describe('useRestaurants', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps raw rows to DomainRestaurant shape', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: [rawRestaurant()] }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRestaurants(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data![0].id).toBe('rest-1')
    expect(result.current.data![0].name).toBe('Spice Garden')
  })

  it('surfaces an error when Supabase returns an error', async () => {
    // Message includes 'supabase' so the hook's retry function short-circuits immediately
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ error: { message: 'supabase: DB connection failed' } }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRestaurants(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('supabase: DB connection failed')
  })
})

// ─── useRestaurant (single) ────────────────────────────────────────────────────

describe('useRestaurant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches a single restaurant by id', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: rawRestaurant('rest-42', 'Taco Bell') }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRestaurant('rest-42'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.name).toBe('Taco Bell')
  })

  it('does not fire when id is null', async () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRestaurant(null), { wrapper: Wrapper })

    // Query is disabled — stays in loading state without fetching
    expect(result.current.fetchStatus).toBe('idle')
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// ─── useRestaurantsWithRecipes ─────────────────────────────────────────────────

describe('useRestaurantsWithRecipes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns only restaurants that have active recipes', async () => {
    const row = {
      ...rawRestaurant('rest-a', 'Noodle House'),
      recipes: [
        {
          id: 'r1', restaurant_id: 'rest-a', visit_id: null,
          name: 'Ramen', description: null, dish_image_url: null,
          estimated_calories: null, status: 'auto_captured', photo_status: 'placeholder',
          gemini_confidence: null, dish_rating: null, dish_review_snippet: null,
          total_protein_g: null, total_carbs_g: null, total_fat_g: null, total_fibre_g: null,
          created_at: new Date().toISOString(),
        },
      ],
    }
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: [row] }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRestaurantsWithRecipes(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data![0].recipes).toHaveLength(1)
    expect(result.current.data![0].recipes[0].name).toBe('Ramen')
  })
})

// ─── useUpsertRestaurant ───────────────────────────────────────────────────────

describe('useUpsertRestaurant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts by placeId when placeId is provided', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: rawRestaurant('rest-new', 'Subway') }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper, qc } = createWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpsertRestaurant(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ placeId: 'ChIJ123', name: 'Subway' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.name).toBe('Subway')
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['restaurants'] })
    )
  })

  it('inserts without placeId when none provided', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: rawRestaurant('rest-anon', 'Unknown Place') }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useUpsertRestaurant(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ name: 'Unknown Place' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.name).toBe('Unknown Place')
  })

  it('surfaces error when Supabase insert fails', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ error: { message: 'insert failed' } }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useUpsertRestaurant(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ name: 'Bad Place' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('insert failed')
  })
})

// ─── useUpdateAtmosphericPalette ───────────────────────────────────────────────

describe('useUpdateAtmosphericPalette', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls update on restaurants table and invalidates queries', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper, qc } = createWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateAtmosphericPalette(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({
        restaurantId: 'rest-1',
        palette: { primary: '#C4622D', secondary: '#F5E6D3', accent: '#8B3A1A' },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['restaurants', 'rest-1'] })
    )
  })

  it('surfaces error when update fails', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ error: { message: 'update failed' } }) as ReturnType<typeof supabase.from>
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useUpdateAtmosphericPalette(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({
        restaurantId: 'rest-1',
        palette: { primary: '#C4622D', secondary: '#F5E6D3', accent: '#8B3A1A' },
      })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('update failed')
  })
})
