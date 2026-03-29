'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 'default' uses radius-md (16px); 'compact' uses radius-sm (12px) */
  variant?: 'default' | 'compact'
  /** Set false to skip the entry animation (e.g. inside lists with own animation) */
  animate?: boolean
}

export function GlassCard({
  variant = 'default',
  animate = true,
  className,
  children,
  ...props
}: GlassCardProps) {
  const shouldReduceMotion = useReducedMotion()

  const initial = animate
    ? shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.96 }
    : false

  const animateTo = animate
    ? shouldReduceMotion
      ? { opacity: 1 }
      : { opacity: 1, scale: 1 }
    : false

  const transition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 }

  return (
    <motion.div
      data-testid="glass-card"
      initial={initial}
      animate={animateTo}
      transition={transition}
      className={cn(
        'glass-card active:opacity-70',
        variant === 'compact'
          ? 'rounded-[var(--radius-sm)]'
          : 'rounded-[var(--radius-md)]',
        className
      )}
      {...(props as React.ComponentPropsWithoutRef<typeof motion.div>)}
    >
      {children}
    </motion.div>
  )
}
