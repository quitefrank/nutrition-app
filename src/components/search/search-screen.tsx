'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { useOnlineStatus } from '@/hooks/use-online-status'
import { useRestaurantSearch } from '@/hooks/use-search'
import { GlassCard } from '@/components/ui/glass-card'
import { ErrorState } from '@/components/ui/error-state'
import { PageHeader } from '@/components/layout/page-header'
import type { RestaurantSearchResult } from '@/types/api'

// ─── Restaurant card sub-component (private) ─────────────────────────────────

function RestaurantCard({
  result,
  onTap,
}: {
  result: RestaurantSearchResult
  onTap: (result: RestaurantSearchResult) => void
}) {
  return (
    <GlassCard
      animate={false}
      className="flex gap-[var(--spacing-3)] p-[var(--spacing-3)] cursor-pointer focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
      onClick={() => onTap(result)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(result) }
      }}
      aria-label={`View ${result.name}`}
    >
      {result.imageUrl ? (
        <img
          src={result.imageUrl}
          alt={result.name}
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-sm)',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
            background: 'var(--glass-strip-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Utensils placeholder icon */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--text-tertiary)' }}
            aria-hidden="true"
          >
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
            <path d="M7 2v20" />
            <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
          </svg>
        </div>
      )}

      <div className="flex flex-col justify-center gap-[var(--spacing-1)] min-w-0">
        <p
          style={{
            fontSize: 'var(--text-base)',
            color: 'var(--text-primary)',
            fontWeight: 600,
          }}
          className="truncate"
        >
          {result.name}
        </p>
        <p
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}
          className="truncate"
        >
          {result.address}
        </p>
      </div>
    </GlassCard>
  )
}

// ─── Loading spinner ──────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div
      role="status"
      aria-label="Searching"
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: 'var(--spacing-6)',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: '3px solid var(--glass-border)',
          borderTopColor: 'var(--text-primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SearchScreen() {
  const isOnline = useOnlineStatus()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem('plately-recent-searches')
      if (!stored) return []
      const parsed: unknown = JSON.parse(stored)
      return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      return []
    }
  })

  const { data, isLoading, isError, refetch, debouncedQuery } = useRestaurantSearch(query)

  if (!isOnline) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6">
        <p style={{ fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>
          No internet connection
        </p>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          Search requires an internet connection. Your grocery list and saved recipes are still
          available offline.
        </p>
      </div>
    )
  }

  function saveRecentSearch(term: string) {
    const normalized = term.trim()
    if (!normalized) return
    setRecentSearches(prev => {
      const updated = [normalized, ...prev.filter(t => t.toLowerCase() !== normalized.toLowerCase())].slice(0, 5)
      try {
        localStorage.setItem('plately-recent-searches', JSON.stringify(updated))
      } catch {
        // ignore storage errors
      }
      return updated
    })
  }

  function handleRecentSearchTap(term: string) {
    setQuery(term)
    saveRecentSearch(term)
  }

  function handleCardTap(result: RestaurantSearchResult) {
    saveRecentSearch(debouncedQuery)
    router.push('/restaurants/' + result.googlePlacesId)
  }

  return (
    <div
      className="flex flex-col flex-1 px-[var(--spacing-4)] pt-[var(--spacing-6)] gap-[var(--spacing-4)]"
      style={{ minHeight: 0 }}
    >
      {/* Header row: logo + title */}
      <PageHeader title="Search" />

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)',
            pointerEvents: 'none',
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="Dish, restaurant..."
          aria-label="Search restaurants or dishes"
          style={{
            height: 52,
            borderRadius: 'var(--radius-full)',
            paddingLeft: 44,
            paddingRight: 16,
            background: 'var(--glass-strip-bg)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-primary)',
            width: '100%',
            fontSize: 'var(--text-base)',
            outline: 'none',
          }}
        />
      </div>

      {/* Recent searches — shown when query is empty or input is blurred */}
      {(query === '' || !inputFocused) && recentSearches.length > 0 && (
        <div className="flex flex-col gap-[var(--spacing-2)]">
          {recentSearches.map(term => (
            <GlassCard
              key={term}
              animate={false}
              style={{
                height: 50,
                display: 'flex',
                alignItems: 'center',
                padding: '0 var(--spacing-4)',
                cursor: 'pointer',
              }}
              className="focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
              onClick={() => handleRecentSearchTap(term)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRecentSearchTap(term) }
              }}
              aria-label={`Search for ${term}`}
            >
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                {term}
              </span>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Results area — only shown when query has 3+ chars */}
      {query.length >= 3 && (
        <div className="flex flex-col gap-[var(--spacing-3)]">
          {isLoading && <LoadingSpinner />}
          {isError && (
            <ErrorState
              message="Search is unavailable right now."
              onRetry={() => {
                void refetch()
              }}
            />
          )}
          {data && data.length === 0 && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center', padding: 'var(--spacing-6) 0' }}>
              No restaurants found for &ldquo;{debouncedQuery}&rdquo;
            </p>
          )}
          {data &&
            data.map(result => (
              <RestaurantCard key={result.googlePlacesId} result={result} onTap={handleCardTap} />
            ))}
        </div>
      )}

      {/* Suggestion copy — always at bottom */}
      <div style={{ marginTop: 'auto', paddingBottom: 'var(--spacing-4)' }}>
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            textAlign: 'center',
          }}
        >
          Try: &apos;carbonara&apos;, &apos;sushi&apos;, &apos;bistro near me&apos;
        </p>
      </div>
    </div>
  )
}
