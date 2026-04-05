'use client'

import { useRouter } from 'next/navigation'

export interface PageHeaderProps {
  /** Page title rendered to the right of the logo mark */
  title?: string
  /** Show a back chevron to the left of the logo. Calls router.back(). */
  showBack?: boolean
  /** Optional element pinned to the right edge (e.g. Edit button) */
  rightSlot?: React.ReactNode
}

/**
 * Shared page header row.
 *
 * Layout (left → right):
 *   [← back (if showBack)] [P logo mark] [title (if provided)]  [rightSlot (if provided)]
 *
 * The header does not add horizontal padding — place it inside a container
 * that already has px-[var(--spacing-4)] (standard screen margin).
 */
export function PageHeader({ title, showBack = false, rightSlot }: PageHeaderProps) {
  const router = useRouter()

  return (
    <div
      data-testid="page-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-3)',
        paddingTop: 'var(--spacing-4)',
        paddingBottom: 'var(--spacing-2)',
        minHeight: 52,
      }}
    >
      {/* Back button — chevron in a small glass pill */}
      {showBack && (
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          data-testid="page-header-back"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255, 255, 255, 0.10)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {/* Chevron left */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Plately logo mark — small glass circle with 'P' */}
      <div
        aria-label="Plately"
        data-testid="page-header-logo"
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-full)',
          background: 'rgba(255, 255, 255, 0.10)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          P
        </span>
      </div>

      {/* Page title */}
      {title && (
        <h1
          style={{
            fontSize: 'var(--text-2xl)',
            color: 'var(--text-primary)',
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
      )}

      {/* Right slot — pushed to the far right */}
      {rightSlot && (
        <div style={{ marginLeft: 'auto' }} data-testid="page-header-right">
          {rightSlot}
        </div>
      )}
    </div>
  )
}
