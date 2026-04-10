"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";

// Minimal shape of a dish as returned by the /api/scan endpoint
export interface ScanDish {
  id?: string;
  name: string;
  description?: string;
  confidence?: number;
  [key: string]: unknown;
}

// Minimal shape of a scan result stored in sessionStorage
export interface ScanResult {
  type: "menu" | "dish";
  restaurantName: string | null;
  allDishes: ScanDish[];
  enriched: boolean;
}

interface InferenceStateProps {
  /** The scan result returned by the API */
  result: ScanResult;
  /** AI confidence for this scan, 0–100 */
  confidence: number;
  /** User confirms the results look correct */
  onConfirm: () => void;
  /** User wants to retake the photo */
  onRetake: () => void;
}

/**
 * InferenceState — shown when Gemini returns a confidence score below 70%.
 *
 * Presents a frosted overlay asking the user to confirm or retake the scan.
 * Animates in with a spring so it feels like part of the native camera UI.
 */
export function InferenceState({
  result,
  confidence,
  onConfirm,
  onRetake,
}: InferenceStateProps) {
  const shouldReduceMotion = useReducedMotion();

  const springTransition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: "spring" as const, damping: 26, stiffness: 320 };

  const primaryDish = result.allDishes[0];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm scan results"
      data-testid="inference-state"
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
      transition={springTransition}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "rgba(13, 11, 9, 0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <FrostedCard
        elevated
        className="w-full max-w-sm"
        style={{ padding: "28px 24px 24px" }}
      >
        {/* Warning icon */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "16px",
          }}
          aria-hidden="true"
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" fill="rgba(176, 125, 44, 0.14)" />
            <path
              d="M12 7v6M12 15.5v1"
              stroke="var(--color-warning)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Heading */}
        <h2
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.1875rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            textAlign: "center",
            marginBottom: "8px",
            lineHeight: 1.3,
          }}
        >
          We&apos;re not 100% sure about this one
        </h2>

        {/* Dish name + confidence pill */}
        {primaryDish && (
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-secondary)",
              textAlign: "center",
              marginBottom: "4px",
            }}
          >
            Looks like <strong style={{ color: "var(--color-text-primary)" }}>{primaryDish.name}</strong>
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "24px",
          }}
        >
          <span
            aria-label={`${confidence}% confidence`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--color-warning)",
              background: "var(--color-warning-light)",
              borderRadius: "var(--radius-full)",
              padding: "3px 10px",
            }}
          >
            {confidence}% confidence
          </span>
        </div>

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          aria-label="Confirm — results look right"
          className="btn-pill btn-primary w-full"
          style={{ marginBottom: "10px" }}
        >
          Looks right
        </button>

        {/* Retake button */}
        <button
          onClick={onRetake}
          aria-label="Retake photo"
          className="btn-pill btn-secondary w-full"
        >
          Retake photo
        </button>
      </FrostedCard>
    </motion.div>
  );
}
