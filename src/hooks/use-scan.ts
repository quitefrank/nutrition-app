'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ScanResult } from '@/types/api'

type ScanStatus = 'idle' | 'processing' | 'ready' | 'error'

interface ScanState {
  status: ScanStatus
  scanId: string | null
  thumbnailUrl: string | null
}

export interface UseScanReturn {
  status: ScanStatus
  scanId: string | null
  thumbnailUrl: string | null
  submitScan: (imageBase64: string, mimeType: string, thumbnailUrl: string) => void
  cancelScan: () => void
  reset: () => void
}

export function useScan(): UseScanReturn {
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)
  const mutationGenRef = useRef(0)
  const [state, setState] = useState<ScanState>({
    status: 'idle',
    scanId: null,
    thumbnailUrl: null,
  })

  // Revoke blob URL when thumbnailUrl clears to prevent memory leaks
  const prevThumbnailRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevThumbnailRef.current
    prevThumbnailRef.current = state.thumbnailUrl
    if (prev && prev !== state.thumbnailUrl) {
      URL.revokeObjectURL(prev)
    }
  }, [state.thumbnailUrl])

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
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++mutationGenRef.current
    setState({ status: 'processing', scanId: null, thumbnailUrl })
    mutate({ imageBase64, mimeType, signal: controller.signal }, {
      onSuccess: (result) => {
        if (mutationGenRef.current !== gen) return // superseded — discard
        queryClient.setQueryData(['scan-result', result.scanId], result)
        setState((prev) => ({ ...prev, status: 'ready', scanId: result.scanId }))
      },
      onError: (err) => {
        if (mutationGenRef.current !== gen) return // superseded — discard
        const isAbort = (err as Error).name === 'AbortError' ||
          (err instanceof DOMException && err.name === 'AbortError')
        if (isAbort) return // user cancelled — stay idle
        setState((prev) => ({ ...prev, status: 'error' }))
      },
    })
  }

  const cancelScan = () => {
    abortRef.current?.abort()
    setState({ status: 'idle', scanId: null, thumbnailUrl: null })
  }

  const reset = () => {
    setState({ status: 'idle', scanId: null, thumbnailUrl: null })
  }

  return {
    status: state.status,
    scanId: state.scanId,
    thumbnailUrl: state.thumbnailUrl,
    submitScan,
    cancelScan,
    reset,
  }
}
