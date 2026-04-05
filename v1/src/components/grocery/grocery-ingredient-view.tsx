'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useGroceryItems,
  useCheckGroceryItem,
  useDeleteGroceryItem,
  useClearChecked,
} from '@/hooks/use-grocery'
import { ErrorState } from '@/components/ui/error-state'
import type { GroceryListItem } from '@/types/api'

export function GroceryIngredientView() {
  const { data: items, isLoading, isError, refetch } = useGroceryItems()
  const { mutate: checkItem } = useCheckGroceryItem()
  const { mutate: deleteItem } = useDeleteGroceryItem()
  const { mutate: clearChecked, isPending: isClearing } = useClearChecked()
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const router = useRouter()

  // Touch tracking for swipe-left detection (ref avoids re-renders on every touchstart)
  const touchStartX = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    // Hide previously revealed row if touching a different row
    if (revealedId !== null && revealedId !== id) setRevealedId(null)
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent, id: string) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    touchStartX.current = null
    if (delta >= 40) {
      // Swipe left — reveal delete button
      setRevealedId(id)
    } else if (delta <= -20) {
      // Swipe right — hide delete button
      if (revealedId === id) setRevealedId(null)
    }
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          paddingTop: '48px',
          color: 'var(--text-tertiary)',
        }}
        aria-label="Loading grocery list"
      >
        Loading…
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: '32px 16px' }}>
        <ErrorState
          message="Could not load your grocery list. Please try again."
          onRetry={() => { void refetch() }}
        />
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 text-center px-6"
        style={{ minHeight: 'calc(100dvh - 80px)' }}
      >
        <p style={{ fontSize: 'var(--text-2xl)', color: 'var(--text-primary)', fontWeight: 600 }}>
          No recipes added yet
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Add a recipe to your grocery list to get started.
        </p>
        <button
          onClick={() => router.push('/')}
          style={{
            marginTop: '8px',
            minHeight: '44px',
            padding: '0 24px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255,255,255,0.12)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: 'var(--text-base)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            cursor: 'pointer',
          }}
          aria-label="Go to recipe collection"
        >
          Browse your recipes →
        </button>
      </div>
    )
  }

  const hasChecked = items.some(item => item.checked)

  return (
    <div
      style={{ padding: '16px 0' }}
      // Dismiss revealed delete button on outside tap
      onClick={() => { if (revealedId !== null) setRevealedId(null) }}
    >
      {/* Header row with Clear checked */}
      {hasChecked && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '0 16px 8px',
          }}
          // Stop propagation so clicking this area doesn't dismiss revealed rows prematurely
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => clearChecked()}
            disabled={isClearing}
            style={{
              minHeight: '44px',
              padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: isClearing ? 'not-allowed' : 'pointer',
            }}
            aria-label="Clear all checked items"
          >
            {isClearing ? 'Clearing…' : 'Clear checked'}
          </button>
        </div>
      )}

      {/* Grocery rows */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Grocery list">
        {items.map(item => (
          <GroceryRow
            key={item.id}
            item={item}
            isRevealed={revealedId === item.id}
            onCheck={() => checkItem({ id: item.id, checked: !item.checked })}
            onDelete={() => {
              deleteItem(item.id)
              setRevealedId(null)
            }}
            onTouchStart={e => handleTouchStart(e, item.id)}
            onTouchEnd={e => handleTouchEnd(e, item.id)}
            onRowClick={e => {
              e.stopPropagation()
              if (revealedId !== null && revealedId !== item.id) setRevealedId(null)
            }}
          />
        ))}
      </ul>
    </div>
  )
}

// ─── Sub-component ─────────────────────────────────────────────────────────────

interface GroceryRowProps {
  item: GroceryListItem
  isRevealed: boolean
  onCheck: () => void
  onDelete: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  onRowClick: (e: React.MouseEvent) => void
}

function GroceryRow({
  item,
  isRevealed,
  onCheck,
  onDelete,
  onTouchStart,
  onTouchEnd,
  onRowClick,
}: GroceryRowProps) {
  const quantityLabel = [item.quantity, item.unit].filter(Boolean).join(' ')

  return (
    <li
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: '56px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={onRowClick}
    >
      {/* Main row content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 16px',
          minHeight: '56px',
          opacity: item.checked ? 0.4 : 1,
          transform: isRevealed ? 'translateX(-72px)' : 'translateX(0)',
          transition: 'transform 0.2s ease, opacity 0.15s ease',
        }}
      >
        {/* Check circle */}
        <button
          onClick={e => {
            e.stopPropagation()
            onCheck()
          }}
          style={{
            flexShrink: 0,
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label={item.checked ? `Uncheck ${item.ingredientName}` : `Check ${item.ingredientName}`}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: `2px solid ${item.checked ? 'var(--text-tertiary)' : 'var(--text-secondary)'}`,
              background: item.checked ? 'var(--text-tertiary)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden="true"
          >
            {item.checked && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </button>

        {/* Ingredient name */}
        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-base)',
            color: 'var(--text-primary)',
            textDecoration: item.checked ? 'line-through' : 'none',
          }}
        >
          {item.ingredientName}
        </span>

        {/* Quantity + unit */}
        {quantityLabel && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 'var(--text-sm)',
              color: 'var(--text-tertiary)',
              textAlign: 'right',
            }}
          >
            {quantityLabel}
          </span>
        )}
      </div>

      {/* Delete button — always in DOM, revealed via CSS transition on swipe-left */}
      <button
        onClick={e => {
          e.stopPropagation()
          onDelete()
        }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '72px',
          height: '100%',
          background: '#ef4444',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isRevealed ? 1 : 0,
          pointerEvents: isRevealed ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
        aria-label={`Delete ${item.ingredientName}`}
        aria-hidden={!isRevealed}
        tabIndex={isRevealed ? 0 : -1}
      >
        {/* Trash icon — inline SVG to avoid icon library dependency */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </li>
  )
}
