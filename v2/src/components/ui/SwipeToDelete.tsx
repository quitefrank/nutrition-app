'use client'

import { useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

const DELETE_THRESHOLD = -80 // px of drag required to reveal delete affordance

interface SwipeToDeleteProps {
  onDelete: () => void
  children: React.ReactNode
}

export function SwipeToDelete({ onDelete, children }: SwipeToDeleteProps) {
  const x = useMotionValue(0)
  const deleteOpacity = useTransform(x, [0, DELETE_THRESHOLD], [0, 1])
  const deleteWidth = useTransform(x, [0, DELETE_THRESHOLD], [0, 80])

  // Guard: prevents double-tap from firing onDelete twice
  const deleting = useRef(false)
  // Tracks drag distance so a tap-without-drag still navigates the card
  const dragDistance = useRef(0)

  function handleDragEnd() {
    dragDistance.current = Math.abs(x.get())
    if (x.get() <= DELETE_THRESHOLD) {
      // Hold open — delete affordance visible
      animate(x, DELETE_THRESHOLD, { type: 'spring', stiffness: 500, damping: 40 })
    } else {
      // Snap back
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 })
    }
  }

  function handleDeleteTap() {
    if (deleting.current) return
    deleting.current = true
    animate(x, -400, { duration: 0.2 })
      .then(() => onDelete())
      .catch(() => {
        deleting.current = false
        animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 })
      })
  }

  return (
    <div className="relative overflow-hidden">
      {/* Delete affordance — sits underneath the draggable card */}
      <motion.div
        style={{ opacity: deleteOpacity, width: deleteWidth }}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <button
          onClick={handleDeleteTap}
          tabIndex={-1}
          className="w-full h-full flex items-center justify-center"
          style={{ background: '#ef4444' }}
          aria-label="Delete recipe"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <polyline points="3,6 5,6 21,6" />
            <path d="m19,6-.867,12.142A2,2,0,0,1,16.137,20H7.863a2,2,0,0,1-1.996-1.858L5,6" />
            <path d="m10,11v6m4-6v6" />
            <path d="m9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2" />
          </svg>
        </button>
      </motion.div>

      {/* Draggable card content */}
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: DELETE_THRESHOLD, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
      >
        {/* Suppress click-through only when a meaningful drag occurred (> 5px) */}
        <div
          onClickCapture={(e) => {
            if (dragDistance.current > 5) {
              e.stopPropagation()
              dragDistance.current = 0
            }
          }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  )
}
