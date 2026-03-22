import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAddToGrocery } from './use-grocery'

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
