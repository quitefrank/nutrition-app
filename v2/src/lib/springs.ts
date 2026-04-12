import type { Transition } from "framer-motion"

/**
 * Primary spring — used for card expand/collapse, button press, and scale interactions.
 * UX-DR9, UX-DR16: stiffness:400 damping:22 per UX spec.
 *
 * Usage in a component:
 *   const reducedMotion = useReducedMotion()
 *   const transition = reducedMotion
 *     ? { duration: 0.15, ease: "easeOut" }
 *     : SPRING_CARD_EXPAND
 *   // When reducedMotion is true, also remove scale from animate/whileTap:
 *   //   whileTap={reducedMotion ? {} : { scale: 0.96 }}
 *
 * Note: useReducedMotion() is imported from "framer-motion" (v12). It returns
 * boolean | null — treat null as false (motion allowed; OS preference not yet resolved).
 *
 * When building components with interactive elements, layer component-specific focus
 * ring styles using Tailwind: focus-visible:ring-2 focus-visible:ring-offset-2
 * focus-visible:ring-[var(--color-accent)]
 */
export const SPRING_CARD_EXPAND: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 22,
}

/**
 * Tab cross-fade transition — 250ms ease-out tween.
 * This is NOT a spring. UX-DR7 specifies "250ms ease-out cross-fade" for tab switching.
 * Spring presets do not have a fixed duration (they run until energy dissipates), which
 * would make tab switching feel unpredictable. This tween gives a controlled 250ms.
 *
 * Usage in FloatingNavBar and tab switching contexts:
 *   const reducedMotion = useReducedMotion()
 *   const transition = reducedMotion
 *     ? { duration: 0.15, ease: "easeOut" }
 *     : SPRING_TAB_TRANSITION
 *   // When reducedMotion is true, animate opacity only — no translate or scale.
 */
export const SPRING_TAB_TRANSITION: Transition = {
  type: "tween",
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
}

/**
 * Modal/banner entrance spring — used for modal overlays and sliding banners.
 * UX-DR12 (ScanConfidenceBanner): stiffness:380 damping:24 per UX spec.
 *
 * Usage:
 *   const reducedMotion = useReducedMotion()
 *   const transition = reducedMotion
 *     ? { duration: 0.15, ease: "easeOut" }
 *     : SPRING_MODAL_ENTER
 *   // When reducedMotion is true, animate opacity only — no translateY or scale.
 */
export const SPRING_MODAL_ENTER: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 24,
}
