'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const TIP_SEEN_KEY = 'plately_tip_seen'

interface TipBannerProps {
  /** Number of scans in sessionStorage — banner only shows when >= 1 */
  scanCount: number
}

export function TipBanner({ scanCount }: TipBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (scanCount < 1) return
    try {
      const seen = localStorage.getItem(TIP_SEEN_KEY)
      if (!seen) setVisible(true)
    } catch {
      // ignore
    }
  }, [scanCount])

  const handleDismiss = () => {
    try {
      localStorage.setItem(TIP_SEEN_KEY, 'true')
    } catch {
      // ignore
    }
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          style={{ overflow: 'hidden' }}
          className="mx-5 mb-1"
        >
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)]"
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-card-border)',
            }}
            role="status"
            aria-live="polite"
          >
            {/* Lightbulb icon */}
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-accent-light)' }}
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M9 21h6M12 3a6 6 0 0 1 4 10.47V17H8v-3.53A6 6 0 0 1 12 3z"
                  stroke="var(--color-accent)"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Message */}
            <p
              className="flex-1 text-[13px] leading-snug"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Tap any dish to see ingredients and nutrition
            </p>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss tip"
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
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
