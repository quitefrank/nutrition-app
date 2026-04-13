'use client'

/**
 * HomeSection — content section wrapper for the home screen.
 *
 * AC4: Header row with 16px semibold title + conditional "See all (N)" terracotta
 *      text link (appears only when itemCount > 4); role="region" + aria-label.
 *
 * Children are rendered below the header in the content slot.
 */

import type { ReactNode } from 'react'

interface HomeSectionProps {
  title: string
  itemCount: number
  onSeeAll?: () => void
  children: ReactNode
}

export function HomeSection({ title, itemCount, onSeeAll, children }: HomeSectionProps) {
  const showSeeAll = itemCount > 4

  return (
    <section role="region" aria-label={title}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-body), system-ui, sans-serif',
            lineHeight: 1.2,
          }}
        >
          {title}
        </span>

        {showSeeAll && (
          <button
            onClick={onSeeAll}
            aria-label={`See all ${title}`}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              fontWeight: 500,
              /* WCAG 2.1 AA: terracotta (#C4622D) requires font-size ≥ 14px AND font-weight ≥ 600.
                 12px does not meet the size threshold — use text-tertiary instead. */
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              minHeight: 44,
              minWidth: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            See all ({itemCount})
          </button>
        )}
      </div>

      {/* Content slot */}
      {children}
    </section>
  )
}
