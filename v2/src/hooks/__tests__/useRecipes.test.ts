import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useRecipes,
  useRecipe,
  useRecipesByRestaurant,
  useSaveRecipe,
  useUpdateRecipe,
  useRemoveRecipe,
  useDeleteRecipe,
} from '../useRecipes'

// ─── Supabase mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => {
  const from = vi.fn()
  return { supabase: { from } }
})

import { supabase } from '@/lib/supabase'

function makeBuilder(result: { data?: unknown; error?: { message: string } | null }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const p = Promise.resolve(resolved)
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolved)),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return builder
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function createWrapperWithClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Valid UUIDs required by RecipeInsertSchema (restaurant_id: Uuid) and
// RecipeIngredientInsertSchema (recipe_id: Uuid).
const RECIPE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440000'
const ING_ID = 'b4c4a1e9-4d5f-4b3a-8c2f-1a2b3c4d5e6f'

const mockRecipeRow = {
  id: RECIPE_ID,
  restaurant_id: RESTAURANT_ID,
  visit_id: null,
  name: 'Duck Confit',
  description: null,
  dish_image_url: null,
  estimated_calories: null,
  status: 'auto_captured' as const,
  gemini_confidence: null,
  created_at: '2026-01-01T00:00:00Z',
}

const mockIngredientRow = {
  id: ING_ID,
  recipe_id: RECIPE_ID,
  name: 'Duck leg',
  quantity: '2',
  unit: 'pcs',
  confidence: 'high' as const,
  usda_fdc_id: null,
  calories_per_serving: null,
  protein_g: null,
  fat_g: null,
  carbs_g: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── useRecipes ───────────────────────────────────────────────────────────────

describe('useRecipes', () => {
  it('fetches from Supabase recipes table excluding removed', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: [mockRecipeRow] }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useRecipes(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(supabase.from).toHaveBeenCalledWith('recipes')
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].id).toBe(RECIPE_ID)
    expect(result.current.data?.[0].name).toBe('Duck Confit')
  })

  it('returns [] when no recipes exist', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useRecipes(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('surfaces Supabase errors', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: { message: 'connection refused' } }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useRecipes(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('connection refused')
  })
})

// ─── useRecipe ────────────────────────────────────────────────────────────────

describe('useRecipe', () => {
  it('is disabled when id is null', () => {
    const { result } = renderHook(() => useRecipe(null), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('fetches recipe row then ingredient rows when id is provided', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: mockRecipeRow }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: [mockIngredientRow] }) as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useRecipe(RECIPE_ID), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.id).toBe(RECIPE_ID)
    expect(result.current.data?.ingredients).toHaveLength(1)
    expect(result.current.data?.ingredients?.[0].name).toBe('Duck leg')
  })

  it('surfaces error from recipe row fetch', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: null, error: { message: 'recipe not found' } }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useRecipe(RECIPE_ID), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('recipe not found')
  })
})

// ─── useRecipesByRestaurant ───────────────────────────────────────────────────

describe('useRecipesByRestaurant', () => {
  it('is disabled when restaurantId is null', () => {
    const { result } = renderHook(() => useRecipesByRestaurant(null), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches recipes for given restaurantId', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: [mockRecipeRow] }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useRecipesByRestaurant(RESTAURANT_ID), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].id).toBe(RECIPE_ID)
  })
})

// ─── useSaveRecipe ────────────────────────────────────────────────────────────

describe('useSaveRecipe', () => {
  it('inserts recipe then ingredients, then fetches the saved recipe', async () => {
    // 1. insert recipe → returns row
    // 2. insert ingredients → ok
    // 3. fetchRecipe: select recipe row
    // 4. fetchRecipe: select ingredient rows
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: mockRecipeRow }) as ReturnType<typeof supabase.from>) // insert recipe
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>) // insert ingredients
      .mockReturnValueOnce(makeBuilder({ data: mockRecipeRow }) as ReturnType<typeof supabase.from>) // fetchRecipe: recipe
      .mockReturnValueOnce(makeBuilder({ data: [mockIngredientRow] }) as ReturnType<typeof supabase.from>) // fetchRecipe: ingredients

    const { result } = renderHook(() => useSaveRecipe(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync({
        recipe: { name: 'Duck Confit', status: 'auto_captured', restaurant_id: RESTAURANT_ID },
        ingredients: [{ recipe_id: RECIPE_ID, name: 'Duck leg', quantity: '2', unit: 'pcs', confidence: 'high' }],
      })
    })

    expect(supabase.from).toHaveBeenCalledWith('recipes')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('skips ingredient insert when ingredients array is empty', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: mockRecipeRow }) as ReturnType<typeof supabase.from>) // insert recipe
      .mockReturnValueOnce(makeBuilder({ data: mockRecipeRow }) as ReturnType<typeof supabase.from>) // fetchRecipe: recipe
      .mockReturnValueOnce(makeBuilder({ data: [] }) as ReturnType<typeof supabase.from>) // fetchRecipe: ingredients

    const { result } = renderHook(() => useSaveRecipe(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync({
        recipe: { name: 'Duck Confit', status: 'auto_captured', restaurant_id: RESTAURANT_ID },
        ingredients: [],
      })
    })

    // from() called 3 times: insert recipe, fetch recipe row, fetch ingredients
    // NOT 4 times (no ingredient insert)
    expect(supabase.from).toHaveBeenCalledTimes(3)
  })

  it('invalidates [recipes] on success', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: mockRecipeRow }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: mockRecipeRow }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: [] }) as ReturnType<typeof supabase.from>)

    const { qc, wrapper } = createWrapperWithClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useSaveRecipe(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        recipe: { name: 'Duck Confit', status: 'auto_captured', restaurant_id: RESTAURANT_ID },
        ingredients: [{ recipe_id: RECIPE_ID, name: 'Duck leg', quantity: '2', unit: 'pcs', confidence: 'high' }],
      })
    })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['recipes'] })
    })
  })

  it('throws when recipe insert errors', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: null, error: { message: 'insert failed' } }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useSaveRecipe(), { wrapper: createWrapper() })

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          recipe: { name: 'Duck Confit', status: 'auto_captured', restaurant_id: RESTAURANT_ID },
          ingredients: [],
        })
      })
    ).rejects.toThrow('insert failed')
  })
})

// ─── useUpdateRecipe ──────────────────────────────────────────────────────────

describe('useUpdateRecipe', () => {
  it('updates recipe fields and refetches', async () => {
    const updatedRow = { ...mockRecipeRow, name: 'Updated Duck Confit' }

    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>) // update
      .mockReturnValueOnce(makeBuilder({ data: updatedRow }) as ReturnType<typeof supabase.from>) // fetchRecipe
      .mockReturnValueOnce(makeBuilder({ data: [] }) as ReturnType<typeof supabase.from>) // ingredients

    const { result } = renderHook(() => useUpdateRecipe(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync({ id: RECIPE_ID, updates: { name: 'Updated Duck Confit' } })
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
      expect(result.current.data?.name).toBe('Updated Duck Confit')
    })
  })

  it('invalidates both [recipes, id] and [recipes] on success', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: mockRecipeRow }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: [] }) as ReturnType<typeof supabase.from>)

    const { qc, wrapper } = createWrapperWithClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateRecipe(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: RECIPE_ID, updates: { name: 'New Name' } })
    })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['recipes', RECIPE_ID] })
      expect(spy).toHaveBeenCalledWith({ queryKey: ['recipes'] })
    })
  })
})

// ─── useRemoveRecipe ──────────────────────────────────────────────────────────

describe('useRemoveRecipe', () => {
  it('soft-deletes by setting status to removed', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useRemoveRecipe(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    expect(supabase.from).toHaveBeenCalledWith('recipes')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('invalidates [recipes] on success', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    )

    const { qc, wrapper } = createWrapperWithClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useRemoveRecipe(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['recipes'] })
    })
  })

  it('throws on Supabase error', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: { message: 'not found' } }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useRemoveRecipe(), { wrapper: createWrapper() })

    await expect(
      act(async () => { await result.current.mutateAsync(RECIPE_ID) })
    ).rejects.toThrow('not found')
  })
})

// ─── useDeleteRecipe ──────────────────────────────────────────────────────────

describe('useDeleteRecipe', () => {
  it('hard-deletes recipe from Supabase', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useDeleteRecipe(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    expect(supabase.from).toHaveBeenCalledWith('recipes')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('invalidates [recipes] on success', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    )

    const { qc, wrapper } = createWrapperWithClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteRecipe(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['recipes'] })
    })
  })
})
