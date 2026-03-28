import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useRestaurantSearch, useRestaurantDishes } from './use-search'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useRestaurantSearch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not fetch when query is shorter than 3 chars', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useRestaurantSearch('ab'), {
      wrapper: makeWrapper(),
    })

    await vi.advanceTimersByTimeAsync(400)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
    expect(result.current.fetchStatus).toBe('idle')
    vi.useRealTimers()
  })

  it('does not fetch when query is empty', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    renderHook(() => useRestaurantSearch(''), { wrapper: makeWrapper() })
    await vi.advanceTimersByTimeAsync(400)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('fetches with encoded query when query is 3+ chars (after debounce)', async () => {
    const mockData = [
      { googlePlacesId: 'place1', name: 'Test Pizza', address: '123 Main St', imageUrl: null },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockData }),
      })
    )

    const { result } = renderHook(() => useRestaurantSearch('abc'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 1000 })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/restaurants?q=abc'
    )
    expect(result.current.data).toEqual(mockData)
  })

  it('encodes special characters in query', async () => {
    const mockData: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockData }),
      })
    )

    const { result } = renderHook(() => useRestaurantSearch('bistro near me'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 1000 })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/restaurants?q=bistro%20near%20me'
    )
  })

  it('sets isError when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Places API unavailable', code: 'PLACES_ERROR' }),
      })
    )

    const { result } = renderHook(() => useRestaurantSearch('sushi'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 1000 })
    expect((result.current.error as Error).message).toBe('Places API unavailable')
  })

  it('uses generic message when error response has no error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      })
    )

    const { result } = renderHook(() => useRestaurantSearch('pizza'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 1000 })
    expect((result.current.error as Error).message).toBe('Search failed')
  })
})

describe('useRestaurantDishes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not fetch when googlePlacesId is null', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useRestaurantDishes(null), {
      wrapper: makeWrapper(),
    })

    await new Promise(r => setTimeout(r, 100))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches dishes when googlePlacesId is provided', async () => {
    const mockDishes = [
      { name: 'Shake Burger', description: 'Classic burger', calorieEstimate: 580, ingredients: [], imageUrl: null },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockDishes }),
      })
    )

    const { result } = renderHook(() => useRestaurantDishes('place-123'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 1000 })
    expect(global.fetch).toHaveBeenCalledWith('/api/search/restaurants/place-123/dishes')
    expect(result.current.data).toEqual(mockDishes)
  })

  it('encodes googlePlacesId in the URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      })
    )

    const { result } = renderHook(() => useRestaurantDishes('place/with+special&chars'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 1000 })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/restaurants/place%2Fwith%2Bspecial%26chars/dishes'
    )
  })

  it('sets isError when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Dish list unavailable', code: 'DISH_LIST_UNAVAILABLE' }),
      })
    )

    const { result } = renderHook(() => useRestaurantDishes('place-123'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 1000 })
    expect((result.current.error as Error).message).toBe('Dish list unavailable')
  })

  it('uses generic message when error response has no error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      })
    )

    const { result } = renderHook(() => useRestaurantDishes('place-123'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 1000 })
    expect((result.current.error as Error).message).toBe('Dish list unavailable')
  })
})
