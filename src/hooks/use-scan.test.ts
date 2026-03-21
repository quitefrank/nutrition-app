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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockScanResult }),
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
