"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface ScanConfidenceBannerProps {
  recognisedCount: number;
  totalDetected: number;
  onRetake: () => void;
  onAddManually: () => void;
  onContinue: () => void;
}

/**
 * ScanConfidenceBanner — shown when Gemini detected more dishes than were
 * successfully read (recognisedCount < totalDetected). Slides up from the
 * bottom of the restaurant screen above the nav bar (Story 2-7).
 *
 * Recovery actions are stubs — full implementations live in Stories 6.2/6.3.
 */
export function ScanConfidenceBanner({
  recognisedCount,
  totalDetected,
  onRetake,
  onAddManually,
  onContinue,
}: ScanConfidenceBannerProps) {
  const shouldReduceMotion = useReducedMotion();
  const missedCount = Math.max(0, totalDetected - recognisedCount);

  const motionProps = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.15 },
      }
    : {
        initial: { opacity: 0, y: "100%" },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: "100%" },
        transition: { type: "spring" as const, stiffness: 380, damping: 24 },
      };

  return (
    <motion.div
      role="alert"
      aria-live="assertive"
      {...motionProps}
      className="fixed left-0 right-0 z-40"
      style={{
        bottom: "calc(var(--tab-bar-height, 64px) + var(--space-safe-bottom, env(safe-area-inset-bottom, 0px)))",
        background: "rgba(251,243,226,0.95)",
        borderTopLeftRadius: "var(--radius-lg, 20px)",
        borderTopRightRadius: "var(--radius-lg, 20px)",
        boxShadow: "0 -4px 24px rgba(80,60,20,0.10), 0 -1px 8px rgba(80,60,20,0.06)",
      }}
    >
      <div className="px-5 pt-4 pb-4">
        {/* Count text */}
        <p
          className="text-base font-semibold mb-0.5"
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            color: "var(--color-text-primary)",
          }}
        >
          {recognisedCount} of {totalDetected} dishes read
        </p>

        {/* Secondary text */}
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {missedCount} couldn&apos;t be identified
        </p>

        {/* Recovery action buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onRetake}
            className="w-full py-3 rounded-full text-sm font-semibold"
            style={{
              background: "var(--color-accent)",
              color: "#fff",
            }}
          >
            Retake photo
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAddManually}
              className="flex-1 py-3 rounded-full text-sm font-medium"
              style={{
                background: "rgba(180,170,158,0.20)",
                color: "var(--color-text-primary)",
              }}
            >
              Add manually
            </button>

            <button
              type="button"
              onClick={onContinue}
              className="flex-1 py-3 rounded-full text-sm font-medium"
              style={{
                background: "rgba(180,170,158,0.20)",
                color: "var(--color-text-secondary)",
              }}
            >
              Continue with {recognisedCount}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
