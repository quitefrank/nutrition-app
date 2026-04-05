'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { GlassCard } from '@/components/ui/glass-card'

export interface InstallPromptBannerProps {
  onInstall: () => void
  onDismiss: () => void
}

export function InstallPromptBanner({ onInstall, onDismiss }: InstallPromptBannerProps) {
  const shouldReduceMotion = useReducedMotion()

  const initial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }
  const animate = shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
  const transition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 }

  return (
    <motion.div
      role="alert"
      aria-label="Install Plately"
      initial={initial}
      animate={animate}
      transition={transition}
      style={{
        position: 'fixed',
        bottom: 'calc(49px + env(safe-area-inset-bottom, 0px) + 8px)',
        left: '16px',
        right: '16px',
        zIndex: 35,
      }}
    >
      <GlassCard animate={false} className="p-4 flex items-center justify-between gap-3">
        <p className="text-sm flex-1">
          Add Plately to your home screen for one-tap access
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onDismiss}
            className="h-11 px-3 text-sm font-medium text-white/60 hover:text-white/90 transition-colors"
            aria-label="Dismiss install prompt"
          >
            Dismiss
          </button>
          <button
            onClick={onInstall}
            className="h-11 px-4 text-sm font-semibold bg-white text-black rounded-[var(--radius-lg)] hover:bg-white/90 transition-colors"
            aria-label="Install Plately"
          >
            Install
          </button>
        </div>
      </GlassCard>
    </motion.div>
  )
}
