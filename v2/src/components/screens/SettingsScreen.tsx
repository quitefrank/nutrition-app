"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { useDataReset } from "@/hooks/useDataReset";
import { ImportScreen } from "@/components/screens/ImportScreen";

const STORAGE_KEY = "plately_user_gemini_key";

/** Minimal check — real validation happens server-side (SEC-ACC-1.00) */
function looksLikeApiKey(value: string): boolean {
  return value.startsWith("AI") && value.length >= 39;
}

export function SettingsScreen() {
  const dataReset = useDataReset();
  const router = useRouter();

  // ─── Delete-all state ────────────────────────────────────────────────────────
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

  async function handleDeleteAll() {
    await dataReset.mutateAsync();
    // Also wipe any session-only scan data
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("plately_"))
      .forEach((k) => sessionStorage.removeItem(k));
    setConfirmingDeleteAll(false);
    // Navigate to empty home state
    router.push("/");
    router.refresh();
  }

  // ─── BYOAK state ────────────────────────────────────────────────────────────
  const [keyInput, setKeyInput] = useState("");
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [keySaveStatus, setKeySaveStatus] = useState<"idle" | "saved" | "error">("idle");

  // Load stored key on mount (client-only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      setStoredKey(saved);
    } catch {
      // localStorage unavailable (private browsing, etc.)
    }
  }, []);

  const handleSaveKey = useCallback(() => {
    const trimmed = keyInput.trim();
    if (!looksLikeApiKey(trimmed)) {
      setKeySaveStatus("error");
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
      setStoredKey(trimmed);
      setKeyInput("");
      setKeySaveStatus("saved");
      setTimeout(() => setKeySaveStatus("idle"), 2500);
    } catch {
      setKeySaveStatus("error");
    }
  }, [keyInput]);

  const handleClearKey = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setStoredKey(null);
      setKeyInput("");
      setKeySaveStatus("idle");
    } catch {
      // Non-critical
    }
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="scroll-content">
      <div className="px-4 pt-6 pb-4 max-w-lg mx-auto space-y-6">
        {/* Page heading */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 340 }}
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          Settings
        </motion.h1>

        {/* ── Section 1: BYOAK ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 340, delay: 0.05 }}
        >
          <FrostedCard>
            {/* Section header */}
            <div className="flex items-center justify-between mb-3">
              <h2
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "1.0625rem",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                Your API Key
              </h2>

              {/* Active / Not set badge */}
              {storedKey ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "var(--color-success-light)",
                    color: "var(--color-success)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--color-success)" }}
                    aria-hidden="true"
                  />
                  Active
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "var(--color-surface-raised)",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--color-text-disabled)" }}
                    aria-hidden="true"
                  />
                  Not set
                </span>
              )}
            </div>

            {/* Description */}
            <p
              className="mb-1"
              style={{
                fontSize: "0.875rem",
                color: "var(--color-text-secondary)",
                lineHeight: 1.55,
              }}
            >
              Use your own Gemini API key for unlimited scanning. Your key is stored on your device
              only — never sent to our servers.
            </p>

            {/* Get a key hint */}
            <p
              className="mb-4"
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-tertiary)",
                lineHeight: 1.5,
              }}
            >
              Get a free key at{" "}
              <span
                style={{
                  color: "var(--color-accent)",
                  fontWeight: 500,
                  fontFamily: "monospace",
                  fontSize: "0.8125rem",
                }}
              >
                ai.google.dev
              </span>
            </p>

            {/* Key input */}
            <div className="flex gap-2 mb-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  if (keySaveStatus !== "idle") setKeySaveStatus("idle");
                }}
                placeholder="Paste your key here…"
                aria-label="Gemini API key"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-[var(--radius-md)] px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--color-surface)",
                  border: `1px solid ${keySaveStatus === "error" ? "var(--color-error)" : "var(--color-card-border)"}`,
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                  minHeight: 44,
                  transition: "border-color 0.15s ease",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveKey();
                }}
              />
              <button
                onClick={handleSaveKey}
                disabled={!keyInput.trim()}
                aria-label="Save API key"
                className="btn-pill btn-primary px-4 text-sm"
                style={{
                  height: 44,
                  minWidth: 80,
                  opacity: keyInput.trim() ? 1 : 0.5,
                  fontSize: "0.875rem",
                  padding: "0 16px",
                }}
              >
                Save Key
              </button>
            </div>

            {/* Validation / success feedback */}
            {keySaveStatus === "error" && (
              <p
                role="alert"
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--color-error)",
                  marginBottom: 8,
                }}
              >
                Key must start with "AI" and be at least 39 characters.
              </p>
            )}
            {keySaveStatus === "saved" && (
              <p
                role="status"
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--color-success)",
                  marginBottom: 8,
                }}
              >
                Key saved to this device.
              </p>
            )}

            {/* Clear key button — only shown when a key is stored */}
            {/* WCAG 2.1 AA: explicit height/minHeight: 40 overrides the global min-height: 44px. */}
            {storedKey && (
              <button
                onClick={handleClearKey}
                aria-label="Clear stored API key"
                className="btn-pill btn-ghost text-sm"
                style={{
                  fontSize: "0.875rem",
                  color: "var(--color-text-tertiary)",
                  padding: "0 12px",
                  minHeight: 44,
                }}
              >
                Clear Key
              </button>
            )}
          </FrostedCard>
        </motion.div>

        {/* ── Section 2: Import a Recipe ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 340, delay: 0.1 }}
        >
          <Suspense fallback={null}>
            <ImportScreen embedded />
          </Suspense>
        </motion.div>
        {/* ── Section 3: Data ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 340, delay: 0.15 }}
        >
          <FrostedCard>
            <h2
              className="mb-2"
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "1.0625rem",
                fontWeight: 600,
                color: "var(--color-text-primary)",
              }}
            >
              Data
            </h2>
            <p
              className="mb-4"
              style={{
                fontSize: "0.875rem",
                color: "var(--color-text-secondary)",
                lineHeight: 1.55,
              }}
            >
              Permanently delete all recipes and dishes from your collection. This cannot be undone.
            </p>
            {/* WCAG 2.1 AA: explicit height/minHeight: 40 overrides the global min-height: 44px. */}
            <button
              onClick={() => setConfirmingDeleteAll(true)}
              className="btn-pill text-sm font-medium px-4"
              style={{
                minHeight: 44,
                background: "rgba(251,234,234,0.95)",
                color: "#A03030",
                fontSize: "0.875rem",
              }}
            >
              Delete all recipes
            </button>
          </FrostedCard>
        </motion.div>
      </div>

      {/* Delete-all confirmation modal */}
      <AnimatePresence>
        {confirmingDeleteAll && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: "rgba(26,22,18,0.50)" }}
            onClick={() => setConfirmingDeleteAll(false)}
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0, transition: { type: "spring", damping: 28, stiffness: 380 } }}
              exit={{ scale: 0.93, opacity: 0, y: 8, transition: { duration: 0.15 } }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-[24px] p-6 flex flex-col gap-5"
              style={{
                background: "rgba(255,252,247,0.96)",
                backdropFilter: "blur(32px) saturate(1.5)",
                border: "1px solid rgba(180,170,158,0.28)",
                boxShadow: "0 24px 60px rgba(26,22,18,0.20), 0 8px 24px rgba(26,22,18,0.12)",
              }}
            >
              <div className="flex flex-col gap-1.5">
                <p
                  className="text-base font-semibold"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
                >
                  Delete all recipes?
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  Every recipe and dish in your collection will be permanently removed. This can&apos;t be undone.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => void handleDeleteAll()}
                  disabled={dataReset.isPending}
                  className="w-full py-3.5 rounded-full text-sm font-semibold"
                  style={{ background: "#A03030", color: "#fff", opacity: dataReset.isPending ? 0.6 : 1 }}
                >
                  {dataReset.isPending ? "Deleting…" : "Delete all"}
                </button>
                <button
                  onClick={() => setConfirmingDeleteAll(false)}
                  className="w-full py-3.5 rounded-full text-sm font-medium"
                  style={{ background: "rgba(180,170,158,0.15)", color: "var(--color-text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
