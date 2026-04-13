import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper(qc: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return Wrapper
}

const MOCK_AUTO_SCAN_RESPONSE = {
  data: {
    restaurantName: 'Sala Thai',
    dishes: [],
    menuPhotoUrl: null,
    dishPhotos: [],
  },
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useAutoScan', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  it('posts { placeId, name } to /api/restaurants/auto-scan', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_AUTO_SCAN_RESPONSE,
    })

    const { useAutoScan } = await import('./useAutoScan')
    const { result } = renderHook(() => useAutoScan(), { wrapper: createWrapper(qc) })

    await act(async () => {
      result.current.mutate({ placeId: 'place-abc', name: 'Sala Thai' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/restaurants/auto-scan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ placeId: 'place-abc', restaurantName: 'Sala Thai' }),
      })
    )
  })

  it('invalidates ["restaurants", "with-recipes"] on success', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_AUTO_SCAN_RESPONSE,
    })

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { useAutoScan } = await import('./useAutoScan')
    const { result } = renderHook(() => useAutoScan(), { wrapper: createWrapper(qc) })

    await act(async () => {
      result.current.mutate({ placeId: 'place-abc', name: 'Sala Thai' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['restaurants', 'with-recipes'] })
    )
  })

  it('exposes error on failure', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: { code: 'SCAN_UNAVAILABLE', message: 'Auto-scan failed' },
      }),
    })

    const { useAutoScan } = await import('./useAutoScan')
    const { result } = renderHook(() => useAutoScan(), { wrapper: createWrapper(qc) })

    await act(async () => {
      result.current.mutate({ placeId: 'place-err', name: 'Bad Restaurant' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Auto-scan failed')
  })

  it('does NOT invalidate the cache on failure', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
    })

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { useAutoScan } = await import('./useAutoScan')
    const { result } = renderHook(() => useAutoScan(), { wrapper: createWrapper(qc) })

    await act(async () => {
      result.current.mutate({ placeId: 'place-fail', name: 'Failing Place' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['restaurants', 'with-recipes'] })
    )
  })
})
