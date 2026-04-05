'use client'

import { motion, useReducedMotion } from 'framer-motion'

export default function Template({ children }: { children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: shouldReduceMotion ? 0.15 : 0.2, ease: 'easeOut' }}
      className="flex flex-col flex-1"
    >
      {children}
    </motion.div>
  )
}
