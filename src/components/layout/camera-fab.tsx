'use client'

import { motion, useReducedMotion } from 'framer-motion'

interface CameraFabProps {
  onClick: () => void
}

export function CameraFab({ onClick }: CameraFabProps) {
  const shouldReduceMotion = useReducedMotion()

  const initial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }
  const animateTo = shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1.0 }
  const transition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 }

  return (
    <motion.button
      initial={initial}
      animate={animateTo}
      transition={transition}
      onClick={onClick}
      aria-label="Open camera"
      className="glass-fab active:scale-[0.97] flex items-center justify-center rounded-[var(--radius-full)]"
      style={{ width: '56px', height: '56px' }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
        <path d="M16 3H8L5 7h14l-3-4z" />
        <circle cx="12" cy="14" r="3" />
      </svg>
    </motion.button>
  )
}
