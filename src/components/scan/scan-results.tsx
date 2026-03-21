'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { GlassCard } from '@/components/ui/glass-card'
import { DishDetailSheet } from './dish-detail-sheet'
import type { ScanResult, DishResult } from '@/types/api'

interface ScanResultsProps {
  result: ScanResult
  scanId: string
}

export function ScanResults({ result, scanId }: ScanResultsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedDishIndex, setSelectedDishIndex] = useState<number | null>(null)

  const handleRetake = () => {
    queryClient.removeQueries({ queryKey: ['scan-result', scanId] })
    router.push('/')
    // Signal AppShell to open camera after navigation settles
    setTimeout(() => window.dispatchEvent(new CustomEvent('plately:openCamera')), 300)
  }

  const selectedDish = selectedDishIndex !== null ? result.dishes[selectedDishIndex] : null

  return (
    <div style={{ padding: '0 var(--spacing-4)', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-4) 0' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
          {result.dishes.length} dish{result.dishes.length !== 1 ? 'es' : ''} found
        </span>
        <button
          onClick={handleRetake}
          style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', minHeight: '44px' }}
          aria-label="Retake scan"
        >
          ↺ Retake
        </button>
      </div>

      {/* Dish list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        {result.dishes.map((dish, i) => (
          <DishCard key={dish.name} dish={dish} onClick={() => setSelectedDishIndex(i)} />
        ))}
      </div>

      {/* Bottom sheet */}
      <DishDetailSheet
        dish={selectedDish}
        open={selectedDish !== null}
        onClose={() => setSelectedDishIndex(null)}
        scanId={scanId}
        dishIndex={selectedDishIndex ?? 0}
      />
    </div>
  )
}

function DishCard({ dish, onClick }: { dish: DishResult; onClick: () => void }) {
  return (
    <GlassCard
      variant="compact"
      onClick={onClick}
      style={{ cursor: 'pointer', padding: 'var(--spacing-3)', display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}
    >
      {/* Thumbnail: 64×64pt — imageUrl is null in 2.3 (enriched in Story 2.4) */}
      {dish.imageUrl ? (
        <img src={dish.imageUrl} alt={dish.name} style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', flexShrink: 0 }} />
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
