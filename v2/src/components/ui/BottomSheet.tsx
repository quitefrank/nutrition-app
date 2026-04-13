"use client";

/**
 * BottomSheet — reusable slide-up sheet with backdrop, focus trap, spring
 * animation, and reduced-motion fallback.
 *
 * UX conventions:
 *   - --glass-base background, --shadow-float shadow, 22px top border radius
 *   - Spring animation y: '100%' → 0 using SPRING_CARD_EXPAND
 *   - useReducedMotion() gates translate — opacity-only fallback when preferred
 *   - Semi-opaque backdrop (rgba(0,0,0,0.4)); click calls onClose
 *   - Escape key closes the sheet (handled via document listener and panel keydown)
 *   - Focus trap: first focusable element receives focus when sheet opens;
 *     Tab/Shift+Tab cycles within the sheet (circular).
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { SPRING_CARD_EXPAND } from "@/lib/springs";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Accessible label for the dialog (aria-label). */
  label?: string;
}

export function BottomSheet({ isOpen, onClose, children, label }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // Focus trap: move focus to first focusable element when opened
  useEffect(() => {
    if (!isOpen) return;
    const el = panelRef.current;
    if (el) {
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable[0]?.focus();
    }
  }, [isOpen]);

  // Close on Escape key (document-level listener covers cases where focus
  // has moved outside the panel, e.g. screen-reader virtual cursor)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Circular Tab trap + Escape handler on the panel itself
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab") return;

    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: wrap from first → last
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: wrap from last → first
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Reduced-motion: opacity-only; full motion: spring translate from y=100%
  const sheetInitial = reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 1 };
  const sheetAnimate = reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 };
  const sheetExit = reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 1 };
  const sheetTransition = reducedMotion
    ? { duration: 0.15, ease: "easeOut" }
    : SPRING_CARD_EXPAND;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Semi-opaque backdrop */}
          <motion.div
            data-testid="bottom-sheet-backdrop"
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.4)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.15 : 0.2, ease: "easeOut" }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="fixed bottom-0 left-0 right-0 z-50 outline-none"
            style={{
              background: "var(--glass-base)",
              backdropFilter: "blur(20px) saturate(1.4)",
              WebkitBackdropFilter: "blur(20px) saturate(1.4)",
              boxShadow: "var(--shadow-float)",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
            initial={sheetInitial}
            animate={sheetAnimate}
            exit={sheetExit}
            transition={sheetTransition}
            onKeyDown={handleKeyDown}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
              <div
                className="w-10 h-1 rounded-full"
                style={{ background: "var(--color-text-tertiary)", opacity: 0.4 }}
              />
            </div>

            <div className="px-5 pt-3 pb-2">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
