"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface AutoCaptureToastProps {
  restaurantName: string;
  dishCount: number;
  onDismiss: () => void;
}

const DISPLAY_MS = 2500;

export function AutoCaptureToast({ restaurantName, dishCount, onDismiss }: AutoCaptureToastProps) {
  const shouldReduceMotion = useReducedMotion();
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const label = dishCount === 1 ? "1 dish saved" : `${dishCount} dishes saved`;

  const motionProps = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: -40 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -40 },
        transition: { type: "spring" as const, damping: 28, stiffness: 360 },
      };

  return (
    <motion.div
      role="status"
      aria-live="polite"
      {...motionProps}
      className="fixed z-50 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 rounded-2xl"
      style={{
        top: "calc(var(--space-safe-top, env(safe-area-inset-top, 0px)) + 12px)",
        maxWidth: "calc(100% - 32px)",
        background: "var(--glass-elevated)",
        backdropFilter: "var(--blur-elevated)",
        WebkitBackdropFilter: "var(--blur-elevated)",
        border: "var(--border-glass)",
        boxShadow: "var(--shadow-float)",
      }}
    >
      <CheckmarkIcon />
      <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
        <span style={{ color: "var(--color-accent)", fontWeight: 600 }}>{restaurantName}</span>
        {" · "}
        {label}
      </span>
    </motion.div>
  );
}

function CheckmarkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" fill="var(--color-accent)" opacity={0.15} />
      <path d="M8 12.5l3 3 5-6" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
