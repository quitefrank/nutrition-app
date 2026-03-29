'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

interface ProcessingStripProps {
  status: 'processing' | 'ready'
  thumbnailUrl: string | null
  onTap: () => void
  onCancel: () => void
}

function AnimatedEllipsis({ text }: { text: string }) {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) {
    return <span>{text}...</span>
  }
  return (
    <span>
      {text}
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        ...
      </motion.span>
    </span>
  )
}

function Spinner({ shouldReduceMotion }: { shouldReduceMotion: boolean }) {
  if (shouldReduceMotion) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    )
  }
  return (
    <motion.svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.6)"
      strokeWidth="2"
      strokeLinecap="round"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </motion.svg>
  )
}

function ChevronRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.8)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function ProcessingStrip({ status, thumbnailUrl, onTap, onCancel }: ProcessingStripProps) {
  const shouldReduceMotion = useReducedMotion()
  const [swipeWarning, setSwipeWarning] = useState(false)
  const swipeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (swipeTimerRef.current) clearTimeout(swipeTimerRef.current)
    }
  }, [])

  const springTransition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 }

  const handleDragEnd = (_: unknown, info: { offset: { y: number } }) => {
    if (info.offset.y > 20) {
      if (!swipeWarning) {
        setSwipeWarning(true)
        swipeTimerRef.current = setTimeout(() => setSwipeWarning(false), 3000)
      } else {
        if (swipeTimerRef.current) clearTimeout(swipeTimerRef.current)
        onCancel()
        setSwipeWarning(false)
      }
    }
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
      animate={
        shouldReduceMotion
          ? { opacity: 1 }
          : status === 'ready'
            ? { y: 0, opacity: 1, scale: [1, 1.02, 1] }
            : { y: 0, opacity: 1 }
      }
      exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
      transition={
        status === 'ready'
          ? { ...springTransition, scale: { type: 'tween', duration: 0.3, ease: 'easeInOut' } }
          : springTransition
      }
      drag={status === 'processing' ? 'y' : false}
      dragConstraints={{ top: 0, bottom: 20 }}
      onDragEnd={handleDragEnd}
      onClick={status === 'ready' ? onTap : undefined}
      data-testid="processing-strip"
      style={{
        position: 'fixed',
        bottom: 'calc(49px + env(safe-area-inset-bottom, 0px) + 8px)',
        left: '16px',
        right: '16px',
        height: '56px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--glass-strip-bg)',
        backdropFilter: 'blur(var(--glass-strip-blur, 24px))',
        WebkitBackdropFilter: 'blur(var(--glass-strip-blur, 24px))',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '12px',
        paddingRight: '12px',
        gap: '10px',
        cursor: status === 'ready' ? 'pointer' : 'default',
        zIndex: 40,
      }}
    >
      {/* Thumbnail */}
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt="Captured scan"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-xs)',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      )}

      {/* Text — aria-live here so content changes are announced, not aria-label mutations */}
      <div aria-live="polite" data-testid="processing-strip-status" style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
        {swipeWarning ? (
          'Swipe again to cancel'
        ) : status === 'processing' ? (
          <AnimatedEllipsis text="Identifying your menu" />
        ) : (
          'Your results are ready →'
        )}
      </div>

      {/* Right icon */}
      {status === 'processing' ? <Spinner shouldReduceMotion={shouldReduceMotion ?? false} /> : <ChevronRight />}
    </motion.div>
  )
}
