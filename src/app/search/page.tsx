'use client'

import { useOnlineStatus } from '@/hooks/use-online-status'

export default function SearchPage() {
  const isOnline = useOnlineStatus()

  if (!isOnline) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6">
        <p style={{ fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>No internet connection</p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Search requires an internet connection. Your grocery list and saved recipes are still available offline.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-[var(--spacing-4)] px-[var(--spacing-4)] text-center">
      <h1
        style={{
          fontSize: 'var(--text-xl)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}
      >
        Search
      </h1>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        Coming in Story 5.2
      </p>
    </div>
  )
}
