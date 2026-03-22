'use client'

import { Suspense, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ScanResults } from '@/components/scan/scan-results'
import { InferenceState } from '@/components/scan/inference-state'
import type { ScanResult } from '@/types/api'

export default function ScanResultsPage() {
  return (
    <Suspense fallback={null}>
      <ScanResultsContent />
    </Suspense>
  )
}

function ScanResultsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const scanId = searchParams.get('scanId') ?? ''
  const retakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (retakeTimeoutRef.current) clearTimeout(retakeTimeoutRef.current)
    }
  }, [])

  // Reactive: re-renders when cache updates (e.g. inference → user-confirmed)
  const { data: scanResult } = useQuery<ScanResult | undefined>({
    queryKey: ['scan-result', scanId],
    queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]),
    enabled: !!scanId && !!queryClient.getQueryData(['scan-result', scanId]),
    initialData: queryClient.getQueryData<ScanResult>(['scan-result', scanId]),
    staleTime: Infinity,
  })

  const handleRetake = useCallback(() => {
    if (scanId) {
      queryClient.removeQueries({ queryKey: ['scan-result', scanId] })
      queryClient.removeQueries({ queryKey: ['scan-thumbnail', scanId] })
    }
    router.push('/')
    retakeTimeoutRef.current = setTimeout(() => window.dispatchEvent(new CustomEvent('plately:openCamera')), 300)
  }, [scanId, queryClient, router])

  const handleConfirm = useCallback(() => {
    // cache already updated by InferenceState before calling this
    // the useQuery subscription above will re-render with 'user-confirmed' confidenceSource
    // and switch to rendering ScanResults — no action needed here
  }, [])

  // Redirect on cache miss (page refresh clears TQ memory) — must be in effect, not render
  useEffect(() => {
    if (!scanId || !scanResult) {
      router.replace('/')
    }
  }, [scanId, scanResult, router])

  if (!scanId || !scanResult) return null

  // Route to inference state if confidence is too low
  if (scanResult.confidenceSource === 'inference') {
    return (
      <InferenceState
        result={scanResult}
        scanId={scanId}
        onRetake={handleRetake}
        onConfirm={handleConfirm}
      />
    )
  }

  return <ScanResults result={scanResult} scanId={scanId} onRetake={handleRetake} />
}
