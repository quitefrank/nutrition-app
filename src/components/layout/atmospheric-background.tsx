'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { AtmosphericState } from '@/types/domain'

interface AtmosphericBackgroundProps {
  state?: AtmosphericState
}

/**
 * Full-bleed atmospheric background component.
 * Renders outside #main-content (fixed, z-index -1) so CSS transform on
 * #main-content (BottomSheet open state) does not affect fixed positioning.
 *
 * AC 1: Neutral dark base when no imageUrl.
 * AC 2: blur(48px) saturate(1.4) + gradient overlay + vignette.
 * AC 3: 400ms ease crossfade on imageUrl change.
 * AC 6: fixed inset-0, edge-to-edge including safe areas.
 */
export function AtmosphericBackground({ state }: AtmosphericBackgroundProps) {
  const shouldReduceMotion = useReducedMotion()
  const crossfadeDuration = shouldReduceMotion ? 0.15 : 0.4
  const imageUrl = state?.imageUrl ?? null
  const bgColor = state?.backgroundColorFallback ?? '#0a0a0a'

  // Fall back to bgColor if the image fails to load (404, CORS block, etc.)
  const [imageError, setImageError] = useState(false)
  useEffect(() => { setImageError(false) }, [imageUrl])
  const effectiveImageUrl = imageError ? null : imageUrl

  return (
    <div
      aria-hidden="true"
      className={cn('fixed inset-0 w-full h-full overflow-hidden')}
      style={{ zIndex: -1, backgroundColor: bgColor }}
    >
      {/* Crossfade layer: old image fades out, new image fades in.
          mode="wait" ensures exit completes before enter — clean crossfade. */}
      <AnimatePresence mode="wait">
        {effectiveImageUrl && (
          <motion.div
            key={effectiveImageUrl}
            className="absolute inset-0 w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: crossfadeDuration, ease: 'easeInOut' }}
          >
            {/* Source image — blurred and saturated */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={effectiveImageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                filter: 'blur(48px) saturate(1.4)',
                transform: 'scale(1.1)', // prevent blur edge artifacts
              }}
              onError={() => setImageError(true)}
            />

            {/* Gradient overlay — dark/light mode via CSS custom property */}
            <div
              className="absolute inset-0 w-full h-full"
              style={{ background: 'var(--atmospheric-gradient)' }}
            />

            {/* Vignette — subtle radial at edges, theme-aware */}
            <div
              className="absolute inset-0 w-full h-full"
              style={{ background: 'var(--atmospheric-vignette)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
