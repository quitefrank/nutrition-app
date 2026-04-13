'use client'

/**
 * RestaurantGridCard — 2-column grid card for restaurant collection.
 *
 * UX-DR16: 68px photo area; restaurant name 12px semibold; dish count 11px;
 * glass surface with lighter blur; 16px radius; --shadow-card; scale(0.97)
 * press animation using SPRING_CARD_EXPAND.
 *
 * Accessibility (UX-DR24): role="button", tabIndex=0, aria-label, onKeyDown.
 * Reduced motion (UX-DR25): useReducedMotion() suppresses scale transform.
 * Safari PWA: -webkit-backdrop-filter alongside backdrop-filter.
 */

import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { SPRING_CARD_EXPAND } from '@/lib/springs'
import type { DomainRestaurant } from '@/types/database'

// ─── Props ────────────────────────────────────────────────────────────────────

interface RestaurantGridCardProps {
  restaurant: DomainRestaurant
  dishCount: number
  onPress: () => void
  /** Called after a 500ms pointer hold (touch) or right-click (desktop). */
  onLongPress?: () => void
}

// ─── RestaurantGridCard ───────────────────────────────────────────────────────

export function RestaurantGridCard({ restaurant, dishCount, onPress, onLongPress }: RestaurantGridCardProps) {
  const reducedMotion = useReducedMotion()
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => onLongPress?.(), 500)
  }

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const dishLabel = `${dishCount} ${dishCount !== 1 ? 'dishes' : 'dish'}`
  const ariaLabel = `${restaurant.name}, ${dishLabel}`

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPress()
    }
  }

  return (
    <div role="listitem">
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={onPress}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => { e.preventDefault(); onLongPress?.() }}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        className="overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        style={{
          borderRadius: 16,
          background: 'var(--glass-base)',
          backdropFilter: 'blur(16px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
          boxShadow: 'var(--shadow-card)',
          border: 'var(--border-glass)',
          cursor: 'pointer',
          minHeight: 44,
        }}
        whileTap={reducedMotion ? {} : { scale: 0.97 }}
        transition={reducedMotion ? { duration: 0.15, ease: 'easeOut' } : SPRING_CARD_EXPAND}
      >
        {/* Photo area — 68px height */}
        <div style={{ width: '100%', height: 68, position: 'relative', overflow: 'hidden' }}>
          {restaurant.referenceImageUrl ? (
            <img
              src={restaurant.referenceImageUrl}
              alt=""
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              loading="lazy"
            />
          ) : (
            <PlaceholderTile />
          )}
        </div>

        {/* Text content */}
        <div
          style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {/* Name: 12px semibold, 1 line truncated */}
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              margin: 0,
            }}
          >
            {restaurant.name}
          </p>

          {/* Dish count: 11px */}
          <p
            style={{
              fontSize: '0.6875rem',
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            {dishLabel}
          </p>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Warm placeholder tile ────────────────────────────────────────────────────
// Replicates the PlateIcon + cream background from RestaurantScreen.tsx

function PlaceholderTile() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PlateIcon />
    </div>
  )
}

function PlateIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ opacity: 0.6 }}
    >
      <circle cx="12" cy="12" r="9" stroke="var(--color-accent)" strokeWidth="1.5" />
      <path
        d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
