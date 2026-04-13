import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_UUID = '00000000-0000-4000-8000-000000000001'

function createWrapper(qc: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return Wrapper
}

// Minimal DomainRestaurant-like objects for cache setup
function makeRestaurant(id: string) {
  return { id, name: `Restaurant ${id}`, recipes: [], placeId: null }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useRemoveRestaurant', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  describe('mutationKey', () => {
    it('includes the restaurant id as the third segment (ARCH16)', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      const { useRemoveRestaurant } = await import('./useRemoveRestaurant')
      const { result } = renderHook(() => useRemoveRestaurant(VALID_UUID), {
        wrapper: createWrapper(qc),
      })

      // Trigger a mutation so the entry appears in the mutation cache
      await act(async () => {
        result.current.mutate(VALID_UUID)
      })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // Verify the key in the mutation cache contains the id segment
      const mutations = qc.getMutationCache().getAll()
      expect(mutations.length).toBeGreaterThan(0)
      expect(mutations[0].options.mutationKey).toEqual(['restaurants', 'remove', VALID_UUID])
    })
  })

  describe('DELETE call', () => {
    it('calls DELETE /api/restaurants/:id with the correct id', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      const { useRemoveRestaurant } = await import('./useRemoveRestaurant')
      const { result } = renderHook(() => useRemoveRestaurant(VALID_UUID), {
        wrapper: createWrapper(qc),
      })

      await act(async () => {
        result.current.mutate(VALID_UUID)
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/restaurants/${VALID_UUID}`,
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  describe('cache invalidation', () => {
    it('invalidates ["restaurants", "with-recipes"] on success', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

      const { useRemoveRestaurant } = await import('./useRemoveRestaurant')
      const { result } = renderHook(() => useRemoveRestaurant(VALID_UUID), {
        wrapper: createWrapper(qc),
      })

      await act(async () => {
        result.current.mutate(VALID_UUID)
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['restaurants', 'with-recipes'] })
      )
    })
  })

  describe('optimistic update', () => {
    it('removes target restaurant from cache on mutate', async () => {
      // Seed cache
      const restaurants = [makeRestaurant(VALID_UUID), makeRestaurant('other-id')]
      qc.setQueryData(['restaurants', 'with-recipes'], restaurants)

      // Delay the fetch so we can check optimistic state
      let resolveFetch!: () => void
      ;(global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = () =>
            resolve({
              ok: true,
              json: async () => ({ success: true }),
            } as unknown as Response)
        })
      )

      const { useRemoveRestaurant } = await import('./useRemoveRestaurant')
      const { result } = renderHook(() => useRemoveRestaurant(VALID_UUID), {
        wrapper: createWrapper(qc),
      })

      act(() => {
        result.current.mutate(VALID_UUID)
      })

      // Optimistic update should have removed the target restaurant
      await waitFor(() => {
        const cached = qc.getQueryData<typeof restaurants>(['restaurants', 'with-recipes'])
        expect(cached?.find((r) => r.id === VALID_UUID)).toBeUndefined()
        expect(cached?.find((r) => r.id === 'other-id')).toBeDefined()
      })

      // Resolve the fetch so the test can clean up
      resolveFetch()
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('restores snapshot on fetch error', async () => {
      const restaurants = [makeRestaurant(VALID_UUID), makeRestaurant('other-id')]
      qc.setQueryData(['restaurants', 'with-recipes'], restaurants)

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Restaurant not found' } }),
      })

      const { useRemoveRestaurant } = await import('./useRemoveRestaurant')
      const { result } = renderHook(() => useRemoveRestaurant(VALID_UUID), {
        wrapper: createWrapper(qc),
      })

      await act(async () => {
        result.current.mutate(VALID_UUID)
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      // Snapshot should be restored
      const cached = qc.getQueryData<typeof restaurants>(['restaurants', 'with-recipes'])
      expect(cached?.find((r) => r.id === VALID_UUID)).toBeDefined()
      expect(cached?.length).toBe(2)
    })
  })
})
