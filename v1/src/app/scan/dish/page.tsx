'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { ScanResult } from '@/types/api'
import { PageHeader } from '@/components/layout/page-header'

export default function ScanDishPage() {
  return (
    <Suspense fallback={null}>
      <ScanDishContent />
    </Suspense>
  )
}

function ScanDishContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const scanId = searchParams.get('scanId') ?? ''
  const dishIndex = parseInt(searchParams.get('dishIndex') ?? '0', 10)
  const scanResult = queryClient.getQueryData<ScanResult>(['scan-result', scanId])
  const dish = scanResult?.dishes[dishIndex]

  useEffect(() => {
    if (!dish) {
      router.replace('/')
    }
  }, [dish, router])

  if (!dish) return null

  return (
    <div style={{ padding: '0 var(--spacing-4) var(--spacing-12)' }}>
      <PageHeader title={dish.name} showBack />

      {dish.calorieEstimate !== null && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: '0 0 var(--spacing-2)' }}>
          {dish.calorieEstimate} cal per serving
        </p>
      )}

      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: '0 0 var(--spacing-6)' }}>
        Serving size: 1
      </p>

      <h2 style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 var(--spacing-3)' }}>
        Ingredients
      </h2>

      {dish.ingredients.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          No ingredient details were listed on the menu.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
          {dish.ingredients.map((ing, i) => (
            <li
              key={ing.name}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-3)', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-sm)', minHeight: '56px' }}
            >
              <div>
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{ing.name}</span>
                {/* NFR16: low confidence MUST show both icon AND text — never colour alone */}
                {ing.confidenceLevel === 'low' && (
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginLeft: '6px' }} aria-label="ingredient confidence: varies by restaurant">
                    ⚠ varies by restaurant
                  </span>
                )}
              </div>
              {(ing.quantity || ing.unit) && (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  {[ing.quantity, ing.unit].filter(Boolean).join(' ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
