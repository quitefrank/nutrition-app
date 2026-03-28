'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GlassCard } from '@/components/ui/glass-card'
import { formatDishAlt } from '@/lib/utils'
import { DishDetailSheet } from './dish-detail-sheet'
import { useSaveRecipe, useDeleteRecipe } from '@/hooks/use-recipes'
import type { ScanResult, DishResult, RecipeSaveRequest } from '@/types/api'

interface ScanResultsProps {
  result: ScanResult
  scanId: string
  onRetake?: () => void
}

export function ScanResults({ result, scanId, onRetake: onRetakeProp }: ScanResultsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedDishIndex, setSelectedDishIndex] = useState<number | null>(null)
  const [savedDishIds, setSavedDishIds] = useState<Record<string, string>>({})

  // Subscribe to TQ cache so enrichment updates are reflected reactively
  const { data: liveResult } = useQuery<ScanResult>({
    queryKey: ['scan-result', scanId],
    queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]) ?? result,
    enabled: false,       // never auto-fetch — data arrives via setQueryData
    initialData: result,  // seed from the prop passed in by the page
    staleTime: Infinity,  // treat as always fresh; we control updates via setQueryData
  })

  // Use liveResult throughout — falls back to prop if query hasn't updated yet
  const activeResult = liveResult ?? result

  const saveMutation = useSaveRecipe()
  const deleteMutation = useDeleteRecipe()

  const handleSaveRecipe = async (dish: DishResult) => {
    if (saveMutation.isPending) return

    const payload: RecipeSaveRequest = {
      name: dish.name,
      dishImageUrl: dish.imageUrl,
      confidenceMetadata: { confidenceSource: activeResult.confidenceSource },
      servingSize: 1,
      ingredients: dish.ingredients,
    }

    try {
      const saved = await saveMutation.mutateAsync(payload)
      const savedId = saved.data.id
      setSavedDishIds(prev => ({ ...prev, [dish.name]: savedId }))
      toast('Recipe saved')
    } catch {
      toast.error('Failed to save recipe')
    }
  }

  const handleRemoveRecipe = async (dish: DishResult) => {
    const savedId = savedDishIds[dish.name]
    if (!savedId || deleteMutation.isPending) return
    try {
      await deleteMutation.mutateAsync(savedId)
      setSavedDishIds(prev => { const next = { ...prev }; delete next[dish.name]; return next })
      toast('Recipe removed')
    } catch {
      toast.error('Failed to remove recipe')
    }
  }

  const handleRetake = onRetakeProp ?? (() => {
    queryClient.removeQueries({ queryKey: ['scan-result', scanId] })
    queryClient.removeQueries({ queryKey: ['scan-thumbnail', scanId] })
    router.push('/')
    // Signal AppShell to open camera after navigation settles
    setTimeout(() => window.dispatchEvent(new CustomEvent('plately:openCamera')), 300)
  })

  const selectedDish = selectedDishIndex !== null ? (activeResult.dishes[selectedDishIndex] ?? null) : null

  const [showTip, setShowTip] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('plately_seen_scan_tip')) {
      setShowTip(true)
    }
  }, [])

  const dismissTip = () => {
    localStorage.setItem('plately_seen_scan_tip', 'true')
    setShowTip(false)
  }

  // Empty scan result — differentiated copy based on emptyReason
  if (activeResult.dishes.length === 0) {
    return (
      <>
        {showTip && <ScanTipBanner onDismiss={dismissTip} />}
        <EmptyScanState emptyReason={activeResult.emptyReason ?? null} onRetake={handleRetake} />
      </>
    )
  }

  return (
    <div style={{ padding: '0 var(--spacing-4)', paddingBottom: '80px' }}>
      {/* First-time tip banner */}
      {showTip && <ScanTipBanner onDismiss={dismissTip} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-4) 0' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
          {activeResult.dishes.length} dish{activeResult.dishes.length !== 1 ? 'es' : ''} found
        </span>
        <button
          onClick={handleRetake}
          style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', minHeight: '44px' }}
          aria-label="Retake scan"
        >
          ↺ Retake
        </button>
      </div>

      {/* Partial results banner — only shown when fewer dishes identified than present */}
      {activeResult.totalDishCount && activeResult.dishes.length < activeResult.totalDishCount && (
        <div
          style={{
            background: 'rgba(255,255,255,0.10)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-4)',
            marginBottom: 'var(--spacing-3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--spacing-3)',
          }}
          role="status"
          aria-live="polite"
        >
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, flex: 1 }}>
            We identified {activeResult.dishes.length} of {activeResult.totalDishCount} dishes — lighting may be affecting accuracy. Retake or continue with what we found?
          </p>
          <button
            onClick={handleRetake}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 'var(--text-xs)', padding: '0', flexShrink: 0, minHeight: '44px', minWidth: '44px' }}
            aria-label="Retake scan to improve results"
          >
            ↺ Retake
          </button>
        </div>
      )}

      {/* Dish list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        {activeResult.dishes.map((dish, i) => (
          <DishCard key={`${dish.name}-${i}`} dish={dish} onClick={() => setSelectedDishIndex(i)} />
        ))}
      </div>

      {/* Bottom sheet */}
      <DishDetailSheet
        dish={selectedDish}
        open={selectedDish !== null}
        onClose={() => setSelectedDishIndex(null)}
        scanId={scanId}
        dishIndex={selectedDishIndex ?? 0}
        onSave={handleSaveRecipe}
        savedId={selectedDish ? savedDishIds[selectedDish.name] : undefined}
        onRemove={handleRemoveRecipe}
      />
    </div>
  )
}

const EMPTY_REASON_COPY: Record<'image_quality' | 'not_menu' | 'no_dishes_found', string> = {
  image_quality: "The photo was a bit blurry — try again with better lighting or a steadier shot",
  not_menu: "That doesn't look like a menu — try scanning a restaurant menu or food photo",
  no_dishes_found: "We couldn't spot any dishes — try a different angle or better lighting",
}

function EmptyScanState({ emptyReason, onRetake }: { emptyReason: 'image_quality' | 'not_menu' | 'no_dishes_found' | null; onRetake: () => void }) {
  const message = emptyReason && emptyReason in EMPTY_REASON_COPY
    ? EMPTY_REASON_COPY[emptyReason]
    : EMPTY_REASON_COPY.no_dishes_found

  return (
    <div
      role="status"
      style={{ padding: '0 var(--spacing-4)', paddingTop: 'var(--spacing-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-4)' }}
    >
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        {message}
      </p>
      <button
        onClick={onRetake}
        style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', minHeight: '44px' }}
        aria-label="Retake scan"
      >
        ↺ Retake
      </button>
    </div>
  )
}

function ScanTipBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.10)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--spacing-3) var(--spacing-4)',
        marginBottom: 'var(--spacing-3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--spacing-3)',
      }}
    >
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, flex: 1 }}>
        For best results, hold steady and scan one section at a time.
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss tip"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '0', flexShrink: 0, minHeight: '44px', minWidth: '44px' }}
      >
        ✕
      </button>
    </div>
  )
}

export function DishCard({ dish, onClick }: { dish: DishResult; onClick: () => void }) {
  return (
    <GlassCard
      variant="compact"
      onClick={onClick}
      style={{ cursor: 'pointer', padding: 'var(--spacing-3)', display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}
    >
      {/* Thumbnail: 64×64pt — imageUrl is null in 2.3 (enriched in Story 2.4) */}
      {dish.imageUrl ? (
        <img src={dish.imageUrl} alt={formatDishAlt(dish.name, dish.description)} style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} aria-hidden="true" />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 500 }}>{dish.name}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dish.description}</div>
        {dish.calorieEstimate !== null && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>{dish.calorieEstimate} cal</div>
        )}
      </div>
    </GlassCard>
  )
}
