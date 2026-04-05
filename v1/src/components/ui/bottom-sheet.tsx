'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion, useDragControls } from 'framer-motion'
import FocusTrap from 'focus-trap-react'
import { cn } from '@/lib/utils'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Accessible name for the dialog. Defaults to 'Sheet'. Always pass a meaningful value. */
  label?: string
  className?: string
}

export function BottomSheet({ open, onClose, children, label = 'Sheet', className }: BottomSheetProps) {
  const shouldReduceMotion = useReducedMotion()
  const dragControls = useDragControls()

  // Escape key dismissal — focus-trap's escapeDeactivates is disabled so we
  // own Escape handling exclusively. Inner elements that want to handle Escape
  // without closing the sheet should call e.stopPropagation() (P-1, F6)
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Scale main content when sheet is open — only set when open so cleanup
  // is safe to call unconditionally on unmount (P-4, F1)
  useEffect(() => {
    if (!open) return
    document.body.dataset.sheetOpen = 'true'
    return () => {
      delete document.body.dataset.sheetOpen
    }
  }, [open])

  const sheetVariants = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: '100%' },
    visible: shouldReduceMotion
      ? { opacity: 1, transition: { duration: 0.15 } }
      : {
          opacity: 1,
          y: 0,
          transition: { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 },
        },
    exit: shouldReduceMotion
      ? { opacity: 0, transition: { duration: 0.15 } }
      : { opacity: 0, y: '100%', transition: { duration: 0.2, ease: 'easeIn' as const } },
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay — dims background content (P-5: transition conditioned on reduced motion) */}
          <motion.div
            data-testid="bottom-sheet-overlay"
            className="fixed inset-0 z-40"
            style={{ background: 'var(--overlay-bg)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0.15 } : { duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet — focus trap encompasses entire dialog (P-2/P-3) */}
          <FocusTrap
            active={open}
            focusTrapOptions={{
              // Focus the dialog itself on open — announces it to screen readers
              // without auto-jumping to a form field (F12)
              initialFocus: () =>
                document.querySelector<HTMLElement>('[data-testid="bottom-sheet"]')!,
              returnFocusOnDeactivate: true,
              fallbackFocus: '[data-testid="bottom-sheet"]',
              allowOutsideClick: true,
              // We handle Escape ourselves via the keydown useEffect above
              escapeDeactivates: false,
            }}
          >
            <motion.div
              data-testid="bottom-sheet"
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className={cn(
                'glass-sheet',
                'fixed bottom-0 left-0 right-0 z-50',
                'pb-[env(safe-area-inset-bottom,0px)]',
                className
              )}
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.25 }}
              onDragEnd={(_, info) => {
                if (info.velocity.y > 500 || info.offset.y > 150) onClose()
              }}
            >
              {/* Drag handle — initiates drag gesture; disabled when reduce motion is on (IG-3)
                  touch-action: none required for iOS Safari to not swallow pointerdown (F4) */}
              <div
                className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
                style={{ touchAction: 'none' }}
                aria-hidden="true"
                onPointerDown={(e) => {
                  if (!shouldReduceMotion) dragControls.start(e)
                }}
              >
                <div
                  data-testid="drag-handle"
                  className="rounded-full"
                  style={{
                    width: '36px',
                    height: '4px',
                    background: 'var(--drag-handle-color)',
                  }}
                />
              </div>

              {/* Content */}
              <div className="px-[var(--spacing-5)] pb-[var(--spacing-6)]">
                {children}
              </div>
            </motion.div>
          </FocusTrap>
        </>
      )}
    </AnimatePresence>
  )
}
