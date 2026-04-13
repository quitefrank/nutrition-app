'use client'

/**
 * SearchBar — controlled search input for restaurant search.
 *
 * Glass surface (--glass-base, --shadow-card, 16px radius).
 * Shows a loading pulse when isLoading is true.
 * Shows a × clear button when value is non-empty.
 * Pressing Escape calls onDismiss.
 *
 * Accessibility: aria-label on the input; role="button" on action buttons.
 * UX-DR25: No motion props — this is a pure HTML input component.
 */

import React, { useEffect, useRef } from 'react'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface SearchBarProps {
  value: string
  onChange: (v: string) => void
  onDismiss: () => void
  isLoading?: boolean
  placeholder?: string
}

// ─── SearchBar ─────────────────────────────────────────────────────────────────

export function SearchBar({
  value,
  onChange,
  onDismiss,
  isLoading = false,
  placeholder = 'Search for a restaurant…',
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus when mounted
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 16,
        background: 'var(--glass-base)',
        boxShadow: 'var(--shadow-card)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        border: 'var(--border-glass)',
        padding: '10px 12px',
      }}
    >
      {/* Search icon or loading pulse */}
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isLoading ? (
          <div
            aria-label="Loading"
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid var(--color-accent)',
              borderTopColor: 'transparent',
              animation: 'spin 0.7s linear infinite',
            }}
          />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--color-text-secondary)" strokeWidth="1.8" />
            <path
              d="M16.5 16.5 21 21"
              stroke="var(--color-text-secondary)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* Text input */}
      <input
        ref={inputRef}
        type="search"
        aria-label="Search for a restaurant"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: '1rem',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-body), system-ui, sans-serif',
          minWidth: 0,
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {/* Clear button — only shown when value is non-empty */}
      {value.length > 0 && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--color-bg-elevated)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="var(--color-text-secondary)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      {/* Dismiss / Cancel button */}
      <button
        type="button"
        aria-label="Cancel search"
        onClick={onDismiss}
        style={{
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.875rem',
          /* WCAG 2.1 AA: terracotta (#C4622D) requires font-weight ≥ 600 at font-size ≥ 14px.
             500 does not meet the threshold at exactly 14px — bump to 600. */
          fontWeight: 600,
          color: 'var(--color-accent)',
          fontFamily: 'var(--font-body), system-ui, sans-serif',
          padding: '0 4px',
          lineHeight: 1,
        }}
      >
        Cancel
      </button>

    </div>
  )
}
