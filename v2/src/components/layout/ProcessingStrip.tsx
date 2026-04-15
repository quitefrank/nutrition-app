"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

export type ProcessingState = "idle" | "processing" | "confirming" | "ready" | "error";

interface ProcessingStripProps {
  state: ProcessingState;
  message?: string;
  /** Unused — kept for callers that pass it; navigation target is the restaurant */
  resultId?: string;
  /** Restaurant ID to navigate to when tapped in "ready" state */
  restaurantId?: string;
  /** Confirmed restaurant name — appended as ?name= so RestaurantScreen can display it */
  restaurantName?: string;
  onDismiss?: () => void;
}

const stateConfig: Record<
  Exclude<ProcessingState, "idle">,
  { label: string; icon: React.ReactNode; bg: string; border: string }
> = {
  processing: {
    label: "Identifying your dish…",
    icon: <SpinnerIcon />,
    bg: "rgba(255, 252, 245, 0.92)",
    border: "rgba(180, 170, 158, 0.28)",
  },
  confirming: {
    label: "Confirm restaurant name",
    icon: <SpinnerIcon />,
    bg: "rgba(255, 252, 245, 0.92)",
    border: "rgba(180, 170, 158, 0.28)",
  },
  ready: {
    label: "Your menu is ready — tap to view",
    icon: <ReadyIcon />,
    bg: "rgba(232, 245, 238, 0.95)",
    border: "rgba(61, 125, 94, 0.25)",
  },
  error: {
    label: "Couldn't identify — tap to retry",
    icon: <ErrorIcon />,
    bg: "rgba(251, 234, 234, 0.95)",
    border: "rgba(184, 59, 59, 0.25)",
  },
};

export function ProcessingStrip({
  state,
  message,
  resultId: _resultId,
  restaurantId,
  restaurantName,
  onDismiss,
}: ProcessingStripProps) {
  const router = useRouter();
  const visible = state !== "idle";
  const config = visible ? stateConfig[state] : null;

  const handleTap = () => {
    if (state === "ready" && restaurantId) {
      const nameParam = restaurantName
        ? `?name=${encodeURIComponent(restaurantName)}`
        : "";
      router.push(`/restaurants/${restaurantId}${nameParam}`);
      onDismiss?.();
    } else if (state === "error") {
      onDismiss?.();
    }
  };

  return (
    <AnimatePresence>
      {visible && config && (
        <motion.div
          role="status"
          aria-live="polite"
          className="fixed left-4 right-4 z-35 flex items-center gap-3 px-4 cursor-pointer"
          style={{
            bottom: `calc(var(--tab-bar-height) + var(--space-safe-bottom) + 8px)`,
            height: "var(--processing-strip-height)",
            borderRadius: "var(--radius-full)",
            background: config.bg,
            border: `1px solid ${config.border}`,
            backdropFilter: "blur(24px) saturate(1.4)",
            WebkitBackdropFilter: "blur(24px) saturate(1.4)",
            boxShadow: "var(--shadow-elevated)",
          }}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          onClick={handleTap}
        >
          <span className="flex-shrink-0">{config.icon}</span>
          <span
            className="flex-1 text-sm font-medium truncate"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-body), system-ui, sans-serif",
            }}
          >
            {message ?? config.label}
          </span>
          {(state === "ready" || state === "error") && (
            <ChevronIcon />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ animation: "spin 1s linear infinite" }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeDasharray="14 42"
        strokeLinecap="round"
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

function ReadyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="rgba(61, 125, 94, 0.15)" />
      <path
        d="M8 12l3 3 5-5"
        stroke="#3D7D5E"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="rgba(184, 59, 59, 0.12)" />
      <path
        d="M12 8v5M12 15.5v1"
        stroke="#B83B3B"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 18l6-6-6-6"
        stroke="var(--color-text-tertiary)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
