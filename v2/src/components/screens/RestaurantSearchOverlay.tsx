'use client'

/**
 * RestaurantSearchOverlay — full-screen search overlay for the Home tab.
 *
 * Slides in from bottom (y: "100%" → 0) using SPRING_CARD_EXPAND.
 * useReducedMotion() gates the translate; opacity-only fallback when active.
 *
 * Contains:
 *   - SearchBar at the top
 *   - Stagger-animated results list
 *   - Empty state when query >= 2 and no results
 *   - Error state with retry
 *   - "Scanning [name]…" inline state during auto-scan
 *
 * Dismissible by backdrop click, Escape key, or Cancel button.
 */

import { useState, useCallback, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { SearchBar } from '@/components/ui/SearchBar'
import { RestaurantSearchResult } from '@/components/ui/RestaurantSearchResult'
import { useRestaurantSearch } from '@/hooks/useRestaurantSearch'
import { useAutoScan } from '@/hooks/useAutoScan'
import { useDebounce } from '@/hooks/useDebounce'
import { SPRING_CARD_EXPAND } from '@/lib/springs'
import type { SearchResultData } from '@/components/ui/RestaurantSearchResult'

// ─── Animation variants ────────────────────────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0, y: '100%' },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '100%' },
}

const overlayVariantsReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
  exit: { opacity: 0 },
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

const listItemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 26, stiffness: 340 },
  },
}

const listItemVariantsReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15, ease: 'easeOut' } },
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface RestaurantSearchOverlayProps {
  onDismiss: () => void
}

// ─── RestaurantSearchOverlay ───────────────────────────────────────────────────

export function RestaurantSearchOverlay({ onDismiss }: RestaurantSearchOverlayProps) {
  const reducedMotion = useReducedMotion()
  const [query, setQuery] = useState('')
  // Name of the restaurant currently being scanned, or null
  const [isScanning, setIsScanning] = useState<string | null>(null)

  // Debounce the query so the search hook only fires after the user pauses typing (AC2)
  const debouncedQuery = useDebounce(query, 300)

  const { results, isPending, isError, error, refetch } = useRestaurantSearch(debouncedQuery)
  const autoScan = useAutoScan()

  // Dismiss on Escape key from the overlay level (not the input —
  // the SearchBar's onKeyDown handles Escape inside the input itself)
  const handleOverlayKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        onDismiss()
      }
    },
    [onDismiss]
  )

  // Global Escape handler for cases where focus is on the backdrop
  useEffect(() => {
    function handleGlobalEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onDismiss()
      }
    }
    document.addEventListener('keydown', handleGlobalEscape)
    return () => document.removeEventListener('keydown', handleGlobalEscape)
  }, [onDismiss])

  async function handleSelectResult(result: SearchResultData) {
    if (isScanning) return // prevent double-tap

    setIsScanning(result.name)
    try {
      await autoScan.mutateAsync({ placeId: result.placeId, name: result.name })
      onDismiss()
    } catch {
      // Error surfaced via autoScan.isError — reset scanning state
      setIsScanning(null)
    }
  }

  const showEmpty = debouncedQuery.trim().length >= 2 && !isPending && !isError && results.length === 0

  return (
    <>
      {/* Semi-opaque backdrop */}
      <div
        aria-hidden="true"
        onClick={onDismiss}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 49,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Slide-up panel */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Find a restaurant"
        onKeyDown={handleOverlayKeyDown}
        variants={reducedMotion ? overlayVariantsReduced : overlayVariants}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={reducedMotion ? { duration: 0.15, ease: 'easeOut' } : SPRING_CARD_EXPAND}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-base, #faf7f2)',
          overflowY: 'auto',
          // Only take up the bottom ~80% so backdrop is visible at top
          top: '10%',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
      >
        {/* Drag handle affordance */}
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'var(--color-text-tertiary, rgba(0,0,0,0.2))',
            margin: '12px auto 0',
            flexShrink: 0,
          }}
        />

        {/* Header */}
        <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
          <SearchBar
            value={query}
            onChange={setQuery}
            onDismiss={onDismiss}
            isLoading={isPending && debouncedQuery.trim().length >= 2}
            placeholder="Search for a restaurant…"
          />
        </div>

        {/* Scanning inline state */}
        {isScanning && (
          <div
            aria-live="polite"
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '2px solid var(--color-accent)',
                borderTopColor: 'transparent',
                animation: 'spin 0.7s linear infinite',
                flexShrink: 0,
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: '0.9375rem',
                color: 'var(--color-text-primary)',
              }}
            >
              Scanning <strong>{isScanning}</strong>…
            </p>
          </div>
        )}

        {/* Auto-scan error state */}
        {autoScan.isError && !isScanning && (
          <div
            role="alert"
            style={{
              padding: '12px 20px',
              background: 'rgba(196,98,45,0.08)',
              margin: '12px 16px 0',
              borderRadius: 12,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '0.875rem',
                color: 'var(--color-accent)',
              }}
            >
              {autoScan.error?.message ?? 'Scan failed. Please try again.'}
            </p>
          </div>
        )}

        {/* Results content */}
        <div style={{ flex: 1, paddingTop: 8 }}>
          {/* Error state for search */}
          {isError && !isScanning && (
            <div
              role="alert"
              style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9375rem',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'center',
                }}
              >
                {(error as Error & { code?: string })?.message ?? 'Search failed. Please try again.'}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                style={{
                  alignSelf: 'center',
                  padding: '8px 20px',
                  borderRadius: 9999,
                  border: '1.5px solid var(--color-accent)',
                  background: 'transparent',
                  color: 'var(--color-accent)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body), system-ui, sans-serif',
                }}
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty state */}
          {showEmpty && (
            <p
              style={{
                margin: '24px 20px 0',
                fontSize: '0.9375rem',
                color: 'var(--color-text-secondary)',
                textAlign: 'center',
              }}
            >
              No restaurants found for &ldquo;{query}&rdquo;
            </p>
          )}

          {/* Loading hint when pending and query is valid */}
          {isPending && debouncedQuery.trim().length >= 2 && results.length === 0 && (
            <div
              aria-hidden="true"
              style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{
                    height: 56,
                    borderRadius: 12,
                    background: 'var(--glass-base)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Results list */}
          {results.length > 0 && !isScanning && (
            <motion.div
              variants={listVariants}
              initial="hidden"
              animate="show"
              style={{ paddingBottom: 24 }}
            >
              {/* Divider */}
              <div
                aria-hidden="true"
                style={{
                  height: 1,
                  background: 'var(--border-glass)',
                  margin: '8px 16px',
                }}
              />

              {results.map((result) => (
                <motion.div
                  key={result.placeId}
                  variants={reducedMotion ? listItemVariantsReduced : listItemVariants}
                >
                  <RestaurantSearchResult result={result} onSelect={handleSelectResult} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>
    </>
  )
}
