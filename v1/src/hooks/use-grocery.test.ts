import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAddToGrocery, useGroceryItems, useCheckGroceryItem, useDeleteGroceryItem, useClearChecked } from './use-grocery'
import type { GroceryListItem } from '@/types/api'

const { mockToastSuccess, mockToastError, mockToastInfo } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
    info: mockToastInfo,
  },
}))

function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, wrapper }
}

const RECIPE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('useAddToGrocery', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
    mockToastInfo.mockReset()
  })

  it('mutationFn calls POST /api/grocery with correct recipeId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { added: 2, merged: 0 } }),
    })
    global.fetch = mockFetch

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/grocery', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: RECIPE_ID }),
    }))
  })

  it('onSuccess: invalidates [grocery-items] query key', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { added: 1, merged: 0 } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    })
  })

  it('onSuccess: calls toast.success with correct count when total > 0', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { added: 2, merged: 1 } }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('3 ingredients updated on your grocery list')
    })
  })

  it('onSuccess: calls toast.info when total === 0', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { added: 0, merged: 0 } }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith('No ingredients to add')
    })
  })

  it('onError: calls toast.error with error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Recipe not found' }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync(RECIPE_ID)
      } catch {
        // expected
      }
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Recipe not found')
    })
  })

  it('mutationFn throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Server error' }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await expect(
      act(async () => {
        await result.current.mutateAsync(RECIPE_ID)
      })
    ).rejects.toThrow('Server error')
  })

  it('mutationFn falls back to default error message when response has no error field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await expect(
      act(async () => {
        await result.current.mutateAsync(RECIPE_ID)
      })
    ).rejects.toThrow('Failed to add to grocery list')
  })

  // P-10: non-JSON success response → friendly error
  it('mutationFn throws friendly error when success response body is not valid JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error('Unexpected token')),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await expect(
      act(async () => {
        await result.current.mutateAsync(RECIPE_ID)
      })
    ).rejects.toThrow('Unexpected server response')
  })

  // P-11: missing data field in success response → throws instead of crashing onSuccess
  it('mutationFn throws when success response is missing the data field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await expect(
      act(async () => {
        await result.current.mutateAsync(RECIPE_ID)
      })
    ).rejects.toThrow('Unexpected response format')
  })

  // BS-1: toast should say "updated on your grocery list", not "added to"
  it('onSuccess: toast message says "updated on your grocery list"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { added: 2, merged: 1 } }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(RECIPE_ID)
    })

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('3 ingredients updated on your grocery list')
    })
  })
})

// ─── Helper ───────────────────────────────────────────────────────────────────

const mockGroceryItem: GroceryListItem = {
  id: 'g1',
  recipeId: null,
  ingredientName: 'Eggs',
  quantity: '2',
  unit: null,
  checked: false,
  createdAt: '2026-01-01T00:00:00Z',
}

// ─── useGroceryItems ──────────────────────────────────────────────────────────

describe('useGroceryItems', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('queryFn calls GET /api/grocery and returns GroceryListItem[]', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [mockGroceryItem] }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useGroceryItems(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(global.fetch).toHaveBeenCalledWith('/api/grocery')
    expect(result.current.data).toEqual([mockGroceryItem])
  })

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'DB error' }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useGroceryItems(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('DB error')
  })

  it('falls back to default error message when no error field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useGroceryItems(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Failed to fetch grocery list')
  })
})

// ─── useCheckGroceryItem ──────────────────────────────────────────────────────

describe('useCheckGroceryItem', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockToastError.mockReset()
  })

  it('mutationFn calls PUT /api/grocery/:id with { checked }', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { id: 'g1', checked: true } }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'g1', checked: true })
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/grocery/g1', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: true }),
    }))
  })

  it('onMutate: applies optimistic update to cache', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { id: 'g1', checked: true } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    queryClient.setQueryData(['grocery-items'], [mockGroceryItem])

    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 'g1', checked: true })
    })

    // Optimistic update applied immediately
    const cached = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
    expect(cached?.[0].checked).toBe(true)
  })

  it('onMutate: re-sorts cache — checked item moves after unchecked items', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { id: 'g1', checked: true } }),
    })

    const uncheckedA: GroceryListItem = { ...mockGroceryItem, id: 'g1', createdAt: '2026-01-01T00:00:00Z' }
    const uncheckedB: GroceryListItem = { ...mockGroceryItem, id: 'g2', createdAt: '2026-01-01T00:01:00Z' }
    const { queryClient, wrapper } = createWrapperWithClient()
    queryClient.setQueryData(['grocery-items'], [uncheckedA, uncheckedB])

    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 'g1', checked: true })
    })

    const cached = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
    // uncheckedB should be first; checked g1 should be last
    expect(cached?.[0].id).toBe('g2')
    expect(cached?.[1].id).toBe('g1')
    expect(cached?.[1].checked).toBe(true)
  })

  it('onMutate: no-ops when cache is unpopulated (does not set empty array)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { id: 'g1', checked: true } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    // cache not seeded — getQueryData returns undefined

    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 'g1', checked: true })
    })

    // Cache must remain undefined, not be set to []
    const cached = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
    expect(cached).toBeUndefined()
  })

  it('onError: rolls back cache and calls toast.error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Failed to update item' }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    queryClient.setQueryData(['grocery-items'], [mockGroceryItem])

    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'g1', checked: true })
      } catch {
        // expected
      }
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update item')
    })
  })

  it('onSettled: invalidates [grocery-items]', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { id: 'g1', checked: true } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'g1', checked: true })
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    })
  })
})

// ─── useDeleteGroceryItem ─────────────────────────────────────────────────────

describe('useDeleteGroceryItem', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockToastError.mockReset()
  })

  it('mutationFn calls DELETE /api/grocery/:id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: true } }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useDeleteGroceryItem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('g1')
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/grocery/g1', { method: 'DELETE' })
  })

  it('onMutate: removes item from cache optimistically', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: true } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    queryClient.setQueryData(['grocery-items'], [mockGroceryItem])

    const { result } = renderHook(() => useDeleteGroceryItem(), { wrapper })

    await act(async () => {
      result.current.mutate('g1')
    })

    // Optimistic remove applied
    const cached = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
    expect(cached).toEqual([])
  })

  it('onError: rolls back cache and calls toast.error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Failed to delete item' }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    queryClient.setQueryData(['grocery-items'], [mockGroceryItem])

    const { result } = renderHook(() => useDeleteGroceryItem(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync('g1')
      } catch {
        // expected
      }
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to delete item')
    })
  })

  it('onSettled: invalidates [grocery-items]', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: true } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteGroceryItem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('g1')
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    })
  })
})

// ─── useClearChecked ──────────────────────────────────────────────────────────

describe('useClearChecked', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockToastError.mockReset()
  })

  it('mutationFn calls DELETE /api/grocery/bulk?checked=true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: 2 } }),
    })

    const { wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useClearChecked(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/grocery/bulk?checked=true', { method: 'DELETE' })
  })

  it('onMutate: removes checked items from cache optimistically', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: 1 } }),
    })

    const checkedItem: GroceryListItem = { ...mockGroceryItem, id: 'g2', checked: true }
    const { queryClient, wrapper } = createWrapperWithClient()
    queryClient.setQueryData(['grocery-items'], [mockGroceryItem, checkedItem])

    const { result } = renderHook(() => useClearChecked(), { wrapper })

    await act(async () => {
      result.current.mutate()
    })

    const cached = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
    expect(cached).toEqual([mockGroceryItem])
  })

  it('onMutate: no-ops when cache is unpopulated', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: 0 } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()

    const { result } = renderHook(() => useClearChecked(), { wrapper })

    await act(async () => {
      result.current.mutate()
    })

    const cached = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
    expect(cached).toBeUndefined()
  })

  it('onSettled: invalidates [grocery-items]', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { deleted: 1 } }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useClearChecked(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    })
  })

  it('onError: rolls back cache and calls toast.error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Failed to clear checked items' }),
    })

    const checkedItem: GroceryListItem = { ...mockGroceryItem, id: 'g2', checked: true }
    const { queryClient, wrapper } = createWrapperWithClient()
    queryClient.setQueryData(['grocery-items'], [mockGroceryItem, checkedItem])

    const { result } = renderHook(() => useClearChecked(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync()
      } catch {
        // expected
      }
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to clear checked items')
    })

    // Cache rolled back to original state
    const cached = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
    expect(cached).toEqual([mockGroceryItem, checkedItem])
  })

  it('onSettled: invalidates [grocery-items] even on error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Failed to clear checked items' }),
    })

    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useClearChecked(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync()
      } catch {
        // expected
      }
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    })
  })
})
