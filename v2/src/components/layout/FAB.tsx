"use client";

import { motion } from "framer-motion";

interface FABProps {
  onClick: () => void;
  label?: string;
}

export function FAB({ onClick, label = "Scan or upload" }: FABProps) {
  return (
    <motion.button
      onClick={onClick}
      aria-label={label}
      className="fixed z-40 flex items-center justify-center rounded-full shadow-[var(--shadow-elevated)]"
      style={{
        width: 72,
        height: 72,
        bottom: `calc(var(--tab-bar-height) - 18px)`,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--color-accent)",
        color: "#fff",
      }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <CameraIcon />
      {/* Warm glow ring */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: "0 0 0 3px rgba(255, 252, 245, 0.9), 0 0 0 5px rgba(196, 98, 45, 0.25)",
        }}
        aria-hidden="true"
      />
    </motion.button>
  );
}

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        fill="none"
      />
      <circle
        cx="12"
        cy="13"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="none"
      />
    </svg>
  );
}
