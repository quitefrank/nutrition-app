'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ScanResult } from '@/types/api'

type ScanStatus = 'idle' | 'processing' | 'ready' | 'error'

interface ScanState {
  status: ScanStatus
  scanId: string | null
  thumbnailUrl: string | null
  lastScanParams: { imageBase64: string; mimeType: string; thumbnailUrl: string } | null
}

export interface UseScanReturn {
  status: ScanStatus
  scanId: string | null
  thumbnailUrl: string | null
  submitScan: (imageBase64: string, mimeType: string, thumbnailUrl: string) => void
  cancelScan: () => void
  reset: () => void
  retry: () => void
}

export function useScan(): UseScanReturn {
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timedOutRef = useRef(false)
  const mutationGenRef = useRef(0)
  const [state, setState] = useState<ScanState>({
    status: 'idle',
    scanId: null,
    thumbnailUrl: null,
    lastScanParams: null,
  })

  // Clean up timeout on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current)
    }
  }, [])

  // Revoke blob URL when thumbnailUrl clears to prevent memory leaks
  const prevThumbnailRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevThumbnailRef.current
    prevThumbnailRef.current = state.thumbnailUrl
    if (prev && prev !== state.thumbnailUrl) {
      URL.revokeObjectURL(prev)
    }
  }, [state.thumbnailUrl])

  const fireEnrichment = async (initialResult: ScanResult) => {
    try {
      const res = await fetch('/api/scan/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanId: initialResult.scanId,
          dishes: initialResult.dishes.map((d) => ({
            name: d.name,
            ingredients: d.ingredients,
          })),
        }),
      })
      if (!res.ok) return // 503 or other error — keep Gemini-only result

      const json = await res.json()
      if (!json?.data?.scanId) return // unexpected shape — silently abort

      const enriched = json.data as ScanResult

      // Merge enriched data over the existing cached result (preserve description, calorieEstimate)
      queryClient.setQueryData<ScanResult>(['scan-result', initialResult.scanId], (cached) => {
        if (!cached) return cached // cache was cleared (user navigated and retook) — discard
        // Match by position (server preserves dish/ingredient order) with name guard for safety
        return {
          ...cached,
          confidenceSource: 'multi-source',
          dishes: cached.dishes.map((dish, i) => {
            const enrichedDish = enriched.dishes[i]
            if (!enrichedDish || enrichedDish.name !== dish.name) return dish
            return {
              ...dish,
              imageUrl: enrichedDish.imageUrl ?? dish.imageUrl, // prefer enriched; fallback to existing
              ingredients: dish.ingredients.map((ing, j) => {
                const enrichedIng = enrichedDish.ingredients[j]
                if (!enrichedIng || enrichedIng.name !== ing.name) return ing
                return { ...ing, confidenceLevel: enrichedIng.confidenceLevel }
              }),
            }
          }),
        }
      })
    } catch {
      // Network failure or JSON parse error — silently fail; Gemini-only result persists
    }
  }

  const { mutate } = useMutation({
    mutationFn: async ({
      imageBase64,
      mimeType,
      signal,
    }: {
      imageBase64: string
      mimeType: string
      signal: AbortSignal
    }) => {
      const res = await fetch('/api/scan/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
        signal,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Scan failed')
      }
      const { data } = await res.json()
      return data as ScanResult
    },
  })

  const submitScan = (imageBase64: string, mimeType: string, thumbnailUrl: string) => {
    // Cancel any in-flight scan and its timeout
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++mutationGenRef.current
    timedOutRef.current = false
    setState({ status: 'processing', scanId: null, thumbnailUrl, lastScanParams: { imageBase64, mimeType, thumbnailUrl } })

    // 15s hard timeout (NFR10): if Gemini hasn't responded, surface the error state
    scanTimeoutRef.current = setTimeout(() => {
      if (mutationGenRef.current !== gen) return // already superseded
      timedOutRef.current = true
      controller.abort() // stop the in-flight request
      setState((prev) => ({ ...prev, status: 'error' }))
    }, 15_000)

    mutate({ imageBase64, mimeType, signal: controller.signal }, {
      onSuccess: (result) => {
        if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null }
        if (mutationGenRef.current !== gen) return // superseded — discard
        if (timedOutRef.current) return // response arrived after 15s timeout — discard
        queryClient.setQueryData(['scan-result', result.scanId], result)
        queryClient.setQueryData(['scan-thumbnail', result.scanId], thumbnailUrl)
        setState((prev) => ({ ...prev, status: 'ready', scanId: result.scanId }))
        void fireEnrichment(result) // fire-and-forget enrichment — do NOT await
      },
      onError: (err) => {
        if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null }
        if (mutationGenRef.current !== gen) return // superseded — discard
        const isAbort = (err as Error).name === 'AbortError' ||
          (err instanceof DOMException && err.name === 'AbortError')
        if (isAbort) return // user cancelled or timeout abort (timeout already set error state)
        setState((prev) => ({ ...prev, status: 'error' }))
      },
    })
  }

  const cancelScan = () => {
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null }
    abortRef.current?.abort()
    if (state.scanId) {
      queryClient.removeQueries({ queryKey: ['scan-result', state.scanId] })
      queryClient.removeQueries({ queryKey: ['scan-thumbnail', state.scanId] })
    }
    setState({ status: 'idle', scanId: null, thumbnailUrl: null, lastScanParams: null })
  }

  const reset = () => {
    setState((prev) => ({ status: 'idle', scanId: null, thumbnailUrl: null, lastScanParams: prev.lastScanParams }))
  }

  const retry = () => {
    if (state.lastScanParams) {
      const { imageBase64, mimeType, thumbnailUrl } = state.lastScanParams
      submitScan(imageBase64, mimeType, thumbnailUrl)
    }
  }

  return {
    status: state.status,
    scanId: state.scanId,
    thumbnailUrl: state.thumbnailUrl,
    submitScan,
    cancelScan,
    reset,
    retry,
  }
}
