"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ManualDishEntrySheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the trimmed, validated dish name. Parent handles Supabase insert. */
  onSave: (dishName: string) => Promise<void>;
}

export function ManualDishEntrySheet({
  isOpen,
  onClose,
  onSave,
}: ManualDishEntrySheetProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // P2-D: Ref-based lock prevents two concurrent submits from the same event batch
  // (e.g. Enter key + button click arriving together before saving state propagates).
  const submittingRef = useRef(false);

  // Focus input when sheet opens (P2-B: cleanup timer to prevent leak on fast close)
  useEffect(() => {
    if (isOpen) {
      setValue("");
      setError(null);
      // Small delay so the sheet animation doesn't fight focus
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const trimmed = value.trim();
  const isValid = trimmed.length > 0;

  // P2-D + P1-A: useCallback so onKeyDown reference is stable; catches and surfaces errors.
  const handleSubmit = useCallback(async () => {
    if (!isValid || submittingRef.current) return;
    submittingRef.current = true;
    if (!isValid) {
      setError("Please enter a dish name");
      submittingRef.current = false;
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(trimmed);
      setValue("");
    } catch {
      // P1-A: Surface save failure so the user knows the dish wasn't added.
      setError("Couldn't save the dish — please try again.");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }, [isValid, onSave, trimmed]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.div
            key="manual-entry-scrim"
            className="fixed inset-0 z-40"
            style={{ background: "rgba(26,22,18,0.45)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={saving ? undefined : onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <motion.div
            key="manual-entry-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Add dish manually"
            className="fixed left-0 right-0 z-50"
            style={{
              bottom: "calc(var(--tab-bar-height, 64px) + var(--space-safe-bottom, env(safe-area-inset-bottom, 0px)))",
              background: "rgba(255,252,247,0.98)",
              borderTopLeftRadius: "var(--radius-lg, 20px)",
              borderTopRightRadius: "var(--radius-lg, 20px)",
              boxShadow: "0 -4px 32px rgba(80,60,20,0.14), 0 -1px 8px rgba(80,60,20,0.08)",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
          >
            <div className="px-5 pt-5 pb-5">
              {/* Handle bar */}
              <div
                className="mx-auto mb-4 rounded-full"
                style={{ width: 36, height: 4, background: "rgba(180,170,158,0.40)" }}
                aria-hidden="true"
              />

              <p
                className="text-base font-semibold mb-4"
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  color: "var(--color-text-primary)",
                }}
              >
                Add a dish
              </p>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isValid && !saving) void handleSubmit();
                }}
                placeholder="Dish name…"
                maxLength={100}
                aria-label="Dish name"
                aria-describedby={error ? "manual-entry-error" : undefined}
                aria-invalid={!!error}
                disabled={saving}
                className="w-full rounded-xl px-4 py-3.5 text-sm outline-none"
                style={{
                  background: "rgba(180,170,158,0.12)",
                  border: error
                    ? "1.5px solid rgba(160,48,48,0.55)"
                    : "1.5px solid rgba(180,170,158,0.28)",
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-sans)",
                }}
              />

              {/* Validation error */}
              {error && (
                <p
                  id="manual-entry-error"
                  role="alert"
                  className="text-xs mt-1.5"
                  style={{ color: "#A03030" }}
                >
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!isValid || saving}
                  className="w-full py-3.5 rounded-full text-sm font-semibold"
                  style={{
                    background: isValid && !saving
                      ? "var(--color-accent)"
                      : "rgba(180,170,158,0.25)",
                    color: isValid && !saving ? "#fff" : "rgba(120,110,98,0.55)",
                    transition: "background 0.15s, color 0.15s",
                  }}
                  aria-busy={saving}
                >
                  {saving ? "Adding…" : "Add dish"}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="w-full py-3 text-sm font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
