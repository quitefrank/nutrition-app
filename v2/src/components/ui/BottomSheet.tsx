"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Allow sheet to grow to full height */
  fullHeight?: boolean;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  fullHeight = false,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Trap focus when open
  useEffect(() => {
    if (!open) return;
    const el = sheetRef.current;
    if (el) {
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable[0]?.focus();
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={[
              "fixed bottom-0 left-0 right-0 z-50",
              "frosted-elevated",
              "rounded-t-[var(--radius-xl)]",
              "pb-[calc(var(--space-safe-bottom)+16px)]",
              fullHeight ? "max-h-[92vh]" : "max-h-[75vh]",
              "overflow-y-auto",
              "outline-none",
            ].join(" ")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{
              paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 16px)`,
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
              <div
                className="w-10 h-1 rounded-full"
                style={{ background: "var(--color-text-tertiary)", opacity: 0.4 }}
              />
            </div>

            {title && (
              <div className="px-5 pb-3 border-b border-[var(--color-card-border)]">
                <h2
                  className="text-[1.125rem] font-semibold"
                  style={{ fontFamily: "var(--font-display), Georgia, serif" }}
                >
                  {title}
                </h2>
              </div>
            )}

            <div className="px-5 pt-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
