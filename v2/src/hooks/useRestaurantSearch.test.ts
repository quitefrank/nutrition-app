import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper(qc: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return Wrapper
}

const MOCK_RESULTS = [
  {
    placeId: 'place-1',
    name: 'The Burger Joint',
    address: '1 Main St',
    rating: 4.5,
    userRatingsTotal: 200,
    photoUrl: null,
  },
]

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useRestaurantSearch', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  it('does NOT fetch when query length is less than 2', async () => {
    const { useRestaurantSearch } = await import('./useRestaurantSearch')

    const { result } = renderHook(() => useRestaurantSearch('a'), {
      wrapper: createWrapper(qc),
    })

    // In TanStack Query v5, a disabled query has status='pending' and fetchStatus='idle'.
    // Verify no actual network call was made.
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('does NOT fetch when query is empty', async () => {
    const { useRestaurantSearch } = await import('./useRestaurantSearch')

    const { result } = renderHook(() => useRestaurantSearch(''), {
      wrapper: createWrapper(qc),
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('does NOT fetch when query is only whitespace', async () => {
    const { useRestaurantSearch } = await import('./useRestaurantSearch')

    const { result } = renderHook(() => useRestaurantSearch('  '), {
      wrapper: createWrapper(qc),
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('fetches /api/places/search when query length >= 2', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: MOCK_RESULTS }),
    })

    const { useRestaurantSearch } = await import('./useRestaurantSearch')

    const { result } = renderHook(() => useRestaurantSearch('burger'), {
      wrapper: createWrapper(qc),
    })

    await waitFor(() => expect(result.current.results.length).toBeGreaterThan(0))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/places/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'burger' }),
      })
    )
  })

  it('returns mapped results on success', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: MOCK_RESULTS }),
    })

    const { useRestaurantSearch } = await import('./useRestaurantSearch')

    const { result } = renderHook(() => useRestaurantSearch('burger'), {
      wrapper: createWrapper(qc),
    })

    await waitFor(() => expect(result.current.results.length).toBe(1))

    expect(result.current.results[0]).toMatchObject({
      placeId: 'place-1',
      name: 'The Burger Joint',
      address: '1 Main St',
      rating: 4.5,
    })
    expect(result.current.isError).toBe(false)
  })

  it('exposes isError on API failure', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: { code: 'PLACES_UNAVAILABLE', message: 'Search unavailable' },
      }),
    })

    const { useRestaurantSearch } = await import('./useRestaurantSearch')

    const { result } = renderHook(() => useRestaurantSearch('pizza'), {
      wrapper: createWrapper(qc),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Search unavailable')
  })

  it('returns empty array on success with no results', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    })

    const { useRestaurantSearch } = await import('./useRestaurantSearch')

    const { result } = renderHook(() => useRestaurantSearch('xyzzy'), {
      wrapper: createWrapper(qc),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.results).toEqual([])
    expect(result.current.isError).toBe(false)
  })
})
