'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScanResult } from '@/types/api'

interface InferenceStateProps {
  result: ScanResult
  scanId: string
  onRetake: () => void
  onConfirm: () => void
}

export function InferenceState({ result, scanId, onRetake, onConfirm }: InferenceStateProps) {
  const queryClient = useQueryClient()
  const [correctionText, setCorrectionText] = useState('')
  const [showCorrection, setShowCorrection] = useState(false)

  // Subscribe to TQ cache for reactive reference photo (imageUrl arrives via enrichment)
  const { data: liveResult } = useQuery<ScanResult>({
    queryKey: ['scan-result', scanId],
    queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]) ?? result,
    enabled: false,
    initialData: result,
    staleTime: Infinity,
  })

  // Thumbnail is set once before this component renders and never updated — read directly
  const thumbnailUrl = queryClient.getQueryData<string>(['scan-thumbnail', scanId])

  const activeResult = liveResult ?? result
  const dish = activeResult.dishes[0] // dish scan always has one dish

  // Safety fallback: if dishes array is unexpectedly empty, show retake only
  if (!dish) {
    return (
      <div style={{ padding: '0 var(--spacing-4)', paddingBottom: '80px' }}>
        <div style={{ padding: 'var(--spacing-4) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
          Unable to identify dish
        </div>
        <button
          onClick={onRetake}
          style={{ width: '100%', height: '56px', borderRadius: 'var(--radius-xl)', background: 'rgba(255,255,255,0.90)', color: 'var(--text-on-button)', fontWeight: 600, fontSize: 'var(--text-base)', border: 'none', cursor: 'pointer' }}
          aria-label="Retake scan"
        >
          ↺ Retake scan
        </button>
      </div>
    )
  }

  const handleConfirm = () => {
    queryClient.setQueryData<ScanResult>(['scan-result', scanId], (cached) => {
      if (!cached) return cached
      return { ...cached, confidenceSource: 'user-confirmed' }
    })
    onConfirm()
  }

  const handleCorrectionSubmit = () => {
    // For MVP: re-submit is equivalent to retake (correction text path is V2 when image isn't stored)
    onRetake()
  }

  return (
    <div style={{ padding: '0 var(--spacing-4)', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ padding: 'var(--spacing-4) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
        Help us confirm this dish
      </div>

      {/* Side-by-side photo comparison */}
      <div style={{ display: 'flex', gap: 'var(--spacing-4)', justifyContent: 'center', marginBottom: 'var(--spacing-4)' }}>
        {/* User's photo (left) */}
        <div style={{ textAlign: 'center' }}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="Your photo" style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
          )}
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', display: 'block', marginTop: '4px' }}>Your photo</span>
        </div>

        {/* Reference photo (right) — reactive via TQ */}
        <div style={{ textAlign: 'center' }}>
          {dish.imageUrl ? (
            <img src={dish.imageUrl} alt={`Reference: ${dish.name}`} style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
          )}
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', display: 'block', marginTop: '4px' }}>Reference: {dish.name}</span>
        </div>
      </div>

      {/* Question */}
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', marginBottom: 'var(--spacing-2)', textAlign: 'center' }}>
        Based on this photo, this looks most like <strong>{dish.name}</strong>.
      </p>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-6)', textAlign: 'center' }}>
        Does that match what you ordered?
      </p>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        style={{ width: '100%', height: '56px', borderRadius: 'var(--radius-xl)', background: 'rgba(255,255,255,0.90)', color: 'var(--text-on-button)', fontWeight: 600, fontSize: 'var(--text-base)', border: 'none', cursor: 'pointer', marginBottom: 'var(--spacing-3)' }}
        aria-label="Confirm dish identification"
      >
        Yes, that&apos;s it
      </button>

      {/* Reject / correction */}
      {!showCorrection ? (
        <button
          onClick={() => setShowCorrection(true)}
          style={{ width: '100%', height: '44px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--spacing-3)' }}
        >
          No, that&apos;s not right
        </button>
      ) : (
        <div style={{ marginBottom: 'var(--spacing-3)' }}>
          <input
            type="text"
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            placeholder="What dish is this? (e.g. Duck Confit)"
            style={{ width: '100%', height: '48px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', padding: '0 var(--spacing-4)', boxSizing: 'border-box', marginBottom: 'var(--spacing-2)' }}
            aria-label="Enter dish name for re-submission"
          />
          <button
            onClick={handleCorrectionSubmit}
            disabled={!correctionText.trim()}
            style={{ width: '100%', height: '48px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: correctionText.trim() ? 'pointer' : 'not-allowed', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', opacity: correctionText.trim() ? 1 : 0.5 }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Retake button */}
      <button
        onClick={onRetake}
        style={{ width: '100%', height: '44px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}
        aria-label="Retake scan"
      >
        ↺ Retake scan
      </button>
    </div>
  )
}
