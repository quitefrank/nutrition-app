import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSaveRecipe, useDeleteRecipe, useRecipes, useRecipe, useUpdateRecipe, useRecipesByRestaurant } from './use-recipes'
import type { RecipeSaveRequest, RecipeUpdateRequest } from '@/types/api'
import type { Recipe } from '@/types/domain'

const mockRecipe: Recipe = {
  id: 'recipe-1',
  name: 'Duck Confit',
  restaurantId: null,
  dishImageUrl: 'https://example.com/duck.jpg',
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-22T00:00:00Z',
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, wrapper }
}

const validPayload: RecipeSaveRequest = {
  name: 'Duck Confit',
  dishImageUrl: 'https://example.com/duck.jpg',
  confidenceMetadata: { confidenceSource: 'gemini-only' },
  servingSize: 1,
  ingredients: [
    { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
  ],
}

const mockRecipeWithIngredients: Recipe = {
  id: 'recipe-2',
  name: 'Ramen',
  restaurantId: null,
  dishImageUrl: null,
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-22T00:00:00Z',
  ingredients: [
    { id: 'ing-1', recipeId: 'recipe-2', name: 'Noodles', quantity: '100', unit: 'g', confidenceLevel: 'high', caloriesKcal: null, proteinG: null, fatG: null, carbsG: null },
  ],
}

describe('useRecipe', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fires GET /api/recipes/${id} on mount', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockRecipeWithIngredients }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useRecipe('recipe-2'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith('/api/recipes/recipe-2')
  })

  it('returns Recipe with ingredients from successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockRecipeWithIngredients }),
    })

    const { result } = renderHook(() => useRecipe('recipe-2'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockRecipeWithIngredients)
    expect(result.current.data?.ingredients).toHaveLength(1)
  })

  it('throws error from non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Recipe not found', code: 'NOT_FOUND' }),
    })

    const { result } = renderHook(() => useRecipe('nonexistent'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect((result.current.error as Error).message).toBe('Recipe not found')
  })

  it('does not fire when id is empty string', () => {
    const mockFetch = vi.fn()
    global.fetch = mockFetch

    const { result } = renderHook(() => useRecipe(''), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useRecipes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fires GET /api/recipes on mount', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [] }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useRecipes(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith('/api/recipes')
  })

  it('returns Recipe[] from successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [mockRecipe] }),
    })

    const { result } = renderHook(() => useRecipes(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([mockRecipe])
  })

  it('throws error from non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Failed to fetch recipes', code: 'DB_ERROR' }),
    })

    const { result } = renderHook(() => useRecipes(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect((result.current.error as Error).message).toBe('Failed to fetch recipes')
  })
})

describe('useSaveRecipe', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fires POST /api/recipes with JSON payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: { id: 'recipe-id-1', name: 'Duck Confit', createdAt: '2026-03-22T00:00:00Z', servingSize: 1, restaurantId: null },
      }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useSaveRecipe(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync(validPayload)
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/recipes', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    }))
  })

  it('on success: invalidates recipes query key', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: { id: 'recipe-id-1', name: 'Duck Confit', createdAt: '2026-03-22T00:00:00Z', servingSize: 1, restaurantId: null },
      }),
    })
    global.fetch = mockFetch

    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useSaveRecipe(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(validPayload)
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['recipes'] })
    })
  })

  it('on 422 error: throws with error message from response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'name is required', code: 'VALIDATION_ERROR' }),
    })

    const { result } = renderHook(() => useSaveRecipe(), { wrapper: createWrapper() })

    await expect(
      act(async () => {
        await result.current.mutateAsync(validPayload)
      })
    ).rejects.toThrow('name is required')
  })
})

describe('useUpdateRecipe', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const updatePayload: RecipeUpdateRequest = {
    name: 'Updated Duck Confit',
    servingSize: 2,
    ingredients: [{ id: 'ing-1', name: 'Duck leg', quantity: '4', unit: 'pcs', confidenceLevel: 'high' }],
  }

  const updatedRecipe = {
    id: 'recipe-1',
    name: 'Updated Duck Confit',
    restaurantId: null,
    dishImageUrl: null,
    confidenceMetadataJson: null,
    servingSize: 2,
    createdAt: '2026-03-22T00:00:00Z',
    ingredients: [
      { id: 'ing-1', recipeId: 'recipe-1', name: 'Duck leg', quantity: '4', unit: 'pcs', confidenceLevel: 'high', caloriesKcal: null, proteinG: null, fatG: null, carbsG: null },
    ],
  }

  it('fires PUT /api/recipes/{id} with JSON payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: updatedRecipe }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useUpdateRecipe(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync({ id: 'recipe-1', payload: updatePayload })
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/recipes/recipe-1', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    }))
  })

  it('returns Recipe from successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: updatedRecipe }),
    })

    const { result } = renderHook(() => useUpdateRecipe(), { wrapper: createWrapper() })

    let data: typeof updatedRecipe | undefined
    await act(async () => {
      data = await result.current.mutateAsync({ id: 'recipe-1', payload: updatePayload }) as typeof updatedRecipe
    })

    expect(data?.name).toBe('Updated Duck Confit')
    expect(data?.servingSize).toBe(2)
  })

  it('on success: invalidates recipes and recipes/{id} query keys', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: updatedRecipe }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateRecipe(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'recipe-1', payload: updatePayload })
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['recipes', 'recipe-1'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['recipes'] })
    })
  })

  it('on non-ok response: throws with error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Recipe not found', code: 'NOT_FOUND' }),
    })

    const { result } = renderHook(() => useUpdateRecipe(), { wrapper: createWrapper() })

    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: 'recipe-1', payload: updatePayload })
      })
    ).rejects.toThrow('Recipe not found')
  })
})

describe('useDeleteRecipe', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fires DELETE /api/recipes/{id}', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: true } }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useDeleteRecipe(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync('recipe-id-1')
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/recipes/recipe-id-1', { method: 'DELETE' })
  })

  it('on success: invalidates recipes query key', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: true } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteRecipe(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('recipe-id-1')
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['recipes'] })
    })
  })

  it('on non-ok response: throws with error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Recipe not found', code: 'NOT_FOUND' }),
    })

    const { result } = renderHook(() => useDeleteRecipe(), { wrapper: createWrapper() })

    await expect(
      act(async () => {
        await result.current.mutateAsync('nonexistent-id')
      })
    ).rejects.toThrow('Recipe not found')
  })
})

describe('useRecipesByRestaurant', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fires GET /api/recipes?restaurantId=<id> when restaurantId is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [mockRecipe] }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useRecipesByRestaurant('rest-1'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith('/api/recipes?restaurantId=rest-1')
  })

  it('returns Recipe[] from successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [mockRecipe] }),
    })

    const { result } = renderHook(() => useRecipesByRestaurant('rest-1'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([mockRecipe])
  })

  it('does not fire when restaurantId is null', () => {
    const mockFetch = vi.fn()
    global.fetch = mockFetch

    const { result } = renderHook(() => useRecipesByRestaurant(null), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws error from non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Failed to fetch recipes', code: 'DB_ERROR' }),
    })

    const { result } = renderHook(() => useRecipesByRestaurant('rest-bad'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect((result.current.error as Error).message).toBe('Failed to fetch recipes')
  })
})
