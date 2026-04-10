'use client'

import { FrostedCard } from '@/components/ui/FrostedCard'

interface ErrorStateProps {
  message: string
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({ message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <div role="alert" data-testid="error-state">
      <FrostedCard elevated className="flex flex-col items-center gap-4 py-8 px-6 text-center">
        {/* Warning icon */}
        <div
          className="flex items-center justify-center w-12 h-12 rounded-full"
          style={{ background: 'var(--color-error-light)' }}
          aria-hidden="true"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 9v4M12 17h.01"
              stroke="var(--color-error)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              stroke="var(--color-error)"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Message */}
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {message}
        </p>

        {/* Retry button */}
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn-pill btn-primary w-full"
            style={{ maxWidth: 240 }}
            aria-label={retryLabel}
          >
            {retryLabel}
          </button>
        )}
      </FrostedCard>
    </div>
  )
}
