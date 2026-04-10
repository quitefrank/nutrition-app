'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

interface PartialResultsBannerProps {
  /** Whether the most recent scan returned partial results */
  hasPartialResults: boolean
}

export function PartialResultsBanner({ hasPartialResults }: PartialResultsBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  return (
    <AnimatePresence>
      {hasPartialResults && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="mx-5 mb-1"
          role="status"
          aria-live="polite"
        >
          <div
            className="flex items-start gap-3 p-3 rounded-[var(--radius-md)]"
            style={{
              background: 'var(--color-warning-light)',
              border: '1px solid rgba(176, 125, 44, 0.25)',
            }}
          >
            {/* Warning icon */}
            <div
              className="flex-shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  stroke="var(--color-warning)"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                <path d="M12 9v4M12 17h.01" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>

            {/* Message */}
            <p
              className="flex-1 text-[13px] leading-snug"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Couldn&apos;t identify all dishes — try scanning again for better results.
            </p>

            {/* Dismiss */}
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss partial results notice"
              className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
