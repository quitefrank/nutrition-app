'use client'

import Link from 'next/link'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import type { DishResult } from '@/types/api'

interface DishDetailSheetProps {
  dish: DishResult | null
  open: boolean
  onClose: () => void
  scanId?: string
  dishIndex?: number
  onSave?: (dish: DishResult) => void
  savedId?: string
  onRemove?: (dish: DishResult) => void
  nutritionAvailable?: boolean
}

export function DishDetailSheet({ dish, open, onClose, scanId, dishIndex, onSave, savedId, onRemove, nutritionAvailable }: DishDetailSheetProps) {
  const detailUrl = scanId ? `/scan/dish?scanId=${scanId}&dishIndex=${dishIndex ?? 0}` : null

  return (
    <BottomSheet open={open} onClose={onClose} label={dish?.name ?? 'Dish detail'}>
      {dish && (
        <>
          {/* Full-bleed image — negative margins break out of BottomSheet's 20pt side padding */}
          <div style={{ margin: '0 calc(var(--spacing-5) * -1)' }}>
            {dish.imageUrl ? (
              <img
                src={dish.imageUrl}
                alt={dish.description ? `${dish.name} — ${dish.description}` : dish.name}
                style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', display: 'block' }}
              />
            ) : (
              <div style={{ width: '100%', height: '200px', background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }} aria-hidden="true" />
            )}
          </div>

          {/* Dish name */}
          <h2 style={{ fontSize: 'var(--text-hero)', color: 'var(--text-primary)', fontWeight: 700, margin: 'var(--spacing-4) 0 var(--spacing-2)', lineHeight: 1.2 }}>
            {dish.name}
          </h2>

          {/* Evidence block */}
          <EvidenceBlock dish={dish} nutritionAvailable={nutritionAvailable} />

          {/* Description */}
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 'var(--spacing-3) 0' }}>
            {dish.description}
          </p>

          {/* Divider */}
          <div data-testid="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.10)', margin: 'var(--spacing-4) 0' }} />

          {/* Save / Remove Recipe CTA */}
          {savedId ? (
            <button
              onClick={() => { onRemove?.(dish); onClose() }}
              style={{ width: '100%', height: '56px', borderRadius: 'var(--radius-xl)', background: 'rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 'var(--text-base)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', marginBottom: 'var(--spacing-3)' }}
              aria-label={`Remove recipe for ${dish.name}`}
            >
              Remove Recipe
            </button>
          ) : (
            <button
              onClick={() => { onSave?.(dish); onClose() }}
              style={{ width: '100%', height: '56px', borderRadius: 'var(--radius-xl)', background: 'rgba(255,255,255,0.90)', color: 'var(--text-on-button)', fontWeight: 600, fontSize: 'var(--text-base)', border: 'none', cursor: 'pointer', marginBottom: 'var(--spacing-3)' }}
              aria-label={`Save recipe for ${dish.name}`}
            >
              Save Recipe
            </button>
          )}

          {/* See Full Details — only shown when scanId is provided */}
          {detailUrl && (
            <Link
              href={detailUrl}
              style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', padding: '8px', minHeight: '44px', width: '100%', textAlign: 'center', textDecoration: 'none', lineHeight: '44px' }}
            >
              See Full Details
            </Link>
          )}
        </>
      )}
    </BottomSheet>
  )
}

// Evidence block — confidence is always positive; tone assured; never warning colours
function EvidenceBlock({ dish, nutritionAvailable }: { dish: DishResult; nutritionAvailable?: boolean }) {
  const highCount = dish.ingredients.filter(i => i.confidenceLevel === 'high').length
  const total = dish.ingredients.length
  // Treat as high confidence when: no ingredients (menu scan), or ≥80% are high
  const isHigh = total === 0 || highCount / total >= 0.8
  const evidencePills = dish.ingredients.filter(i => i.confidenceLevel === 'high').slice(0, 4)

  const calorieText = nutritionAvailable === false
    ? ' · Nutrition unavailable'
    : dish.calorieEstimate ? ` · ${dish.calorieEstimate} cal` : ''

  // Fall back to high-confidence display when there are no pills to support the medium-confidence text
  if (isHigh || evidencePills.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 'var(--spacing-2) 0' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
          Identified from your scan{calorieText}
        </p>
      </div>
    )
  }

  return (
    <div style={{ margin: 'var(--spacing-2) 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--spacing-1)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
          Identified from your scan — ingredients match common preparation
        </p>
      </div>
      {evidencePills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {evidencePills.map((ing) => (
            <span key={ing.name} style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.10)', borderRadius: 'var(--radius-full)', padding: '2px 8px' }}>
              {ing.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
