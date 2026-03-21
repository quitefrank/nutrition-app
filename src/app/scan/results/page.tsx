'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ScanResults } from '@/components/scan/scan-results'
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
  // IMPORTANT: Read from TQ cache only — there is no /api endpoint to re-fetch a scan by ID
  const scanResult = queryClient.getQueryData<ScanResult>(['scan-result', scanId])

  const shouldRedirect = !scanId || !scanResult

  useEffect(() => {
    if (shouldRedirect) {
      // Cache miss (page refresh clears TQ memory) — redirect home
      router.replace('/')
    }
  }, [shouldRedirect, router])

  if (shouldRedirect) return null

  return <ScanResults result={scanResult} scanId={scanId} />
}
