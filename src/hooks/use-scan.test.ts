import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useScan } from './use-scan'
import type { ScanResult } from '@/types/api'

const mockScanResult: ScanResult = {
  scanId: 'test-scan-id',
  type: 'menu',
  dishes: [],
  confidenceSource: 'gemini-only',
}

const mockScanResultWithIngredients: ScanResult = {
  scanId: 'test-scan-id',
  type: 'menu',
  confidenceSource: 'gemini-only',
  dishes: [{
    name: 'Duck Confit',
    description: 'Crispy duck leg with cherry jus',
    calorieEstimate: 620,
    imageUrl: null,
    ingredients: [
      { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
      { name: 'Salt blend', quantity: null, unit: null, confidenceLevel: 'low' },
    ],
  }],
}

const mockEnrichedResult: ScanResult = {
  ...mockScanResultWithIngredients,
  confidenceSource: 'multi-source',
  dishes: [{
    ...mockScanResultWithIngredients.dishes[0],
    imageUrl: 'https://lh3.googleusercontent.com/mock-photo',
    ingredients: [
      { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
      { name: 'Salt blend', quantity: null, unit: null, confidenceLevel: 'medium' },
    ],
  }],
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

describe('useScan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initial status is idle', () => {
    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })
    expect(result.current.status).toBe('idle')
    expect(result.current.scanId).toBeNull()
    expect(result.current.thumbnailUrl).toBeNull()
  })

  it('submitScan sets status to processing', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    act(() => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb-url')
    })

    expect(result.current.status).toBe('processing')
    expect(result.current.thumbnailUrl).toBe('blob:thumb-url')
    expect(result.current.scanId).toBeNull()
  })

  it('on successful fetch: status becomes ready and scanId is populated', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockScanResult }),
    })

    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb-url')
    })

    // Wait for mutation to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.scanId).toBe('test-scan-id')
  })

  it('on fetch error: status becomes error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error', code: 'SCAN_FAILED' }),
    })

    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb-url')
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.status).toBe('error')
  })

  it('cancelScan returns status to idle', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    act(() => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb-url')
    })
    expect(result.current.status).toBe('processing')

    act(() => {
      result.current.cancelScan()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.scanId).toBeNull()
    expect(result.current.thumbnailUrl).toBeNull()
  })

  it('reset returns status to idle', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockScanResult }),
    })

    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb-url')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.status).toBe('ready')

    act(() => {
      result.current.reset()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.scanId).toBeNull()
  })

  it('sends correct request body to /api/scan/menu', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockScanResult }),
    })
    global.fetch = fetchSpy

    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.submitScan('mybase64', 'image/png', 'blob:thumb')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/scan/menu',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ imageBase64: 'mybase64', mimeType: 'image/png' }),
      })
    )
  })

  it('TanStack Query cache is populated on success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    // URL-based mock: scan succeeds; enrichment returns non-ok so it bails out silently
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/scan/menu') {
        return { ok: true, json: async () => ({ data: mockScanResult }) }
      }
      return { ok: false } // enrichment fails silently — cache stays as initial scan result
    })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useScan(), { wrapper })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const cached = queryClient.getQueryData(['scan-result', 'test-scan-id'])
    expect(cached).toEqual(mockScanResult)
  })
})

describe('useScan — retry', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('submitScan stores lastScanParams (verified via retry re-submission)', async () => {
    let fetchCallCount = 0
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/scan/menu') {
        fetchCallCount++
        if (fetchCallCount === 1) {
          // First call fails
          return { ok: false, json: async () => ({ error: 'Service unavailable', code: 'SCAN_SERVICE_UNAVAILABLE' }) }
        }
        // Retry call succeeds
        return { ok: true, json: async () => ({ data: mockScanResult }) }
      }
      return { ok: false }
    })

    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.submitScan('mybase64', 'image/jpeg', 'blob:thumb')
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })

    expect(result.current.status).toBe('error')

    // Retry re-submits with same params
    await act(async () => {
      result.current.retry()
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })

    expect(result.current.status).toBe('ready')
    // Verify retry used same imageBase64 by checking fetch was called twice with same body
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const firstBody = JSON.parse(calls[0][1].body)
    const secondBody = JSON.parse(calls[1][1].body)
    expect(firstBody.imageBase64).toBe('mybase64')
    expect(secondBody.imageBase64).toBe('mybase64')
    expect(secondBody.mimeType).toBe('image/jpeg')
  })

  it('retry() is a no-op when no lastScanParams (idle state)', () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    // Call retry when idle — should not call fetch
    act(() => {
      result.current.retry()
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('cancelScan clears lastScanParams (retry becomes no-op after cancel)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Service unavailable', code: 'SCAN_SERVICE_UNAVAILABLE' }),
    })

    const { result } = renderHook(() => useScan(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb')
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })

    expect(result.current.status).toBe('error')

    // Cancel clears lastScanParams
    act(() => { result.current.cancelScan() })
    expect(result.current.status).toBe('idle')

    // Retry after cancel should be a no-op (fetch not called again)
    const fetchCallsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    act(() => { result.current.retry() })
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBefore)
  })
})

describe('useScan — enrichment (fireEnrichment)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('fires enrichment after scan success and merges enriched data into TQ cache', async () => {
    const { queryClient, wrapper } = createWrapperWithClient()

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/scan/menu') {
        return { ok: true, json: async () => ({ data: mockScanResultWithIngredients }) }
      }
      if (url === '/api/scan/enrich') {
        return { ok: true, json: async () => ({ data: mockEnrichedResult }) }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const { result } = renderHook(() => useScan(), { wrapper })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const cached = queryClient.getQueryData<ScanResult>(['scan-result', 'test-scan-id'])
    expect(cached?.confidenceSource).toBe('multi-source')
    expect(cached?.dishes[0].imageUrl).toBe('https://lh3.googleusercontent.com/mock-photo')
    expect(cached?.dishes[0].ingredients[1].confidenceLevel).toBe('medium')
    // description and calorieEstimate must be preserved from original scan (not overwritten by enrich)
    expect(cached?.dishes[0].description).toBe('Crispy duck leg with cherry jus')
    expect(cached?.dishes[0].calorieEstimate).toBe(620)
  })

  it('enrichment fetch throws → original TQ cache entry unchanged', async () => {
    const { queryClient, wrapper } = createWrapperWithClient()

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/scan/menu') {
        return { ok: true, json: async () => ({ data: mockScanResultWithIngredients }) }
      }
      if (url === '/api/scan/enrich') {
        throw new Error('Network failure')
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const { result } = renderHook(() => useScan(), { wrapper })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const cached = queryClient.getQueryData<ScanResult>(['scan-result', 'test-scan-id'])
    expect(cached?.confidenceSource).toBe('gemini-only')
    expect(cached?.dishes[0].imageUrl).toBeNull()
  })

  it('enrichment returns 503 → original TQ cache entry unchanged', async () => {
    const { queryClient, wrapper } = createWrapperWithClient()

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/scan/menu') {
        return { ok: true, json: async () => ({ data: mockScanResultWithIngredients }) }
      }
      if (url === '/api/scan/enrich') {
        return { ok: false, json: async () => ({ error: 'Enrichment service unavailable', code: 'ENRICH_SERVICE_UNAVAILABLE' }) }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const { result } = renderHook(() => useScan(), { wrapper })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const cached = queryClient.getQueryData<ScanResult>(['scan-result', 'test-scan-id'])
    expect(cached?.confidenceSource).toBe('gemini-only')
    expect(cached?.dishes[0].imageUrl).toBeNull()
    expect(cached?.dishes[0].ingredients[1].confidenceLevel).toBe('low')
  })

  it('on scan success, thumbnail stored in TQ cache under ["scan-thumbnail", scanId]', async () => {
    const { queryClient, wrapper } = createWrapperWithClient()

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/scan/menu') {
        return { ok: true, json: async () => ({ data: mockScanResult }) }
      }
      return { ok: false } // enrichment fails silently
    })

    const { result } = renderHook(() => useScan(), { wrapper })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb-url')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const thumbnail = queryClient.getQueryData(['scan-thumbnail', 'test-scan-id'])
    expect(thumbnail).toBe('blob:thumb-url')
  })

  it('cancelScan clears thumbnail from TQ cache', async () => {
    const { queryClient, wrapper } = createWrapperWithClient()

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/scan/menu') {
        return { ok: true, json: async () => ({ data: mockScanResult }) }
      }
      return { ok: false }
    })

    const { result } = renderHook(() => useScan(), { wrapper })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb-url')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Confirm thumbnail is in cache
    expect(queryClient.getQueryData(['scan-thumbnail', 'test-scan-id'])).toBe('blob:thumb-url')

    // Cancel and verify thumbnail is removed
    act(() => {
      result.current.cancelScan()
    })

    expect(queryClient.getQueryData(['scan-thumbnail', 'test-scan-id'])).toBeUndefined()
  })

  it('setQueryData updater returns undefined when cache is cleared before enrichment arrives', async () => {
    const { queryClient, wrapper } = createWrapperWithClient()

    // Enrichment resolves after a delay so we can clear the cache first
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/scan/menu') {
        return { ok: true, json: async () => ({ data: mockScanResultWithIngredients }) }
      }
      if (url === '/api/scan/enrich') {
        return new Promise<object>((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => ({ data: mockEnrichedResult }) }), 80)
        )
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const { result } = renderHook(() => useScan(), { wrapper })

    await act(async () => {
      result.current.submitScan('base64data', 'image/jpeg', 'blob:thumb')
    })
    // Wait for scan to complete but enrichment still in flight
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })

    // Simulate user navigating away / retaking — clear the cache
    act(() => {
      queryClient.removeQueries({ queryKey: ['scan-result', 'test-scan-id'] })
    })

    // Let enrichment complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    // Cache should remain cleared — updater returned undefined (no crash)
    expect(queryClient.getQueryData(['scan-result', 'test-scan-id'])).toBeUndefined()
  })
})
