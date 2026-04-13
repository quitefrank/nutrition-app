'use client'

/**
 * RestaurantSearchResult — single result row for the restaurant search overlay.
 *
 * Renders: name (bold), address (secondary), optional rating chip.
 * Keyboard: Enter activates; Space does NOT (per story spec AC8).
 * UX-DR25: whileTap scale gated on useReducedMotion().
 */

import { motion, useReducedMotion } from 'framer-motion'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface SearchResultData {
  placeId: string
  name: string
  address: string
  rating?: number
  userRatingsTotal?: number
  photoUrl?: string | null
}

export interface RestaurantSearchResultProps {
  result: SearchResultData
  onSelect: (result: SearchResultData) => void
}

// ─── RestaurantSearchResult ────────────────────────────────────────────────────

export function RestaurantSearchResult({ result, onSelect }: RestaurantSearchResultProps) {
  const reducedMotion = useReducedMotion()

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // AC8: Enter activates; Space does NOT
    if (e.key === 'Enter') {
      e.preventDefault()
      onSelect(result)
    }
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`${result.name}, ${result.address} — add to collection`}
      onClick={() => onSelect(result)}
      onKeyDown={handleKeyDown}
      whileTap={reducedMotion ? {} : { scale: 0.98 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset"
    >
      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Restaurant name */}
        <p
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {result.name}
        </p>

        {/* Address */}
        <p
          style={{
            margin: '2px 0 0',
            fontSize: '0.8125rem',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {result.address}
        </p>
      </div>

      {/* Rating chip — only when rating is present */}
      {result.rating != null && (
        <div
          aria-label={`Rating: ${result.rating}`}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 9999,
            background: 'var(--color-accent-light)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M6 1l1.3 2.6 2.9.4-2.1 2 .5 2.9L6 7.5 3.4 8.9l.5-2.9-2.1-2 2.9-.4z"
              fill="var(--color-accent)"
            />
          </svg>
          {/* WCAG 2.1 AA: terracotta (#C4622D) requires font-size ≥ 14px.
              0.75rem (12px) does not meet the threshold — use text-secondary. */}
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
            }}
          >
            {result.rating.toFixed(1)}
          </span>
        </div>
      )}

      {/* Chevron indicator */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, opacity: 0.4 }}
      >
        <path
          d="M9 6l6 6-6 6"
          stroke="var(--color-text-secondary)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  )
}
