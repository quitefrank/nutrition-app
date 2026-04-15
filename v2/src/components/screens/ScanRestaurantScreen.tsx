"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { autoSaveToSupabase } from "@/lib/supabaseAutoSave";
import { useEnrichment } from "@/hooks/useEnrichment";
import { AutoCaptureToast } from "@/components/scan/AutoCaptureToast";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StoredDish {
  id?: string;
  name: string;
  description?: string;
  calorieEstimate?: number | null;
  confidence?: number;
}

interface StoredScanResult {
  restaurantName?: string | null;
  allDishes?: StoredDish[];
}

function updateScanResult(scanKey: string, patch: Record<string, unknown>) {
  try {
    const raw = sessionStorage.getItem(scanKey);
    if (!raw) return;
    const existing = JSON.parse(raw) as Record<string, unknown>;
    sessionStorage.setItem(scanKey, JSON.stringify({ ...existing, ...patch }));
  } catch {
    // non-critical
  }
}

// ─── ScanRestaurantScreen ────────────────────────────────────────────────────

export function ScanRestaurantScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const scanKey = searchParams.get("scanKey") ?? "";

  const [dishes, setDishes] = useState<StoredDish[]>([]);
  const [extractedName, setExtractedName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scanDone, setScanDone] = useState(false);
  const [scanTimedOut, setScanTimedOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState<{ restaurantName: string; dishCount: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { enrich } = useEnrichment();

  // ─── Poll sessionStorage until scan data arrives ─────────────────────────

  useEffect(() => {
    if (!scanKey) {
      setScanTimedOut(true);
      return;
    }

    const tryLoad = (): boolean => {
      try {
        const raw = sessionStorage.getItem(scanKey);
        if (!raw) return false;
        const data = JSON.parse(raw) as StoredScanResult;
        if (data.allDishes && data.allDishes.length > 0) {
          setDishes(data.allDishes);
          const geminiName = data.restaurantName ?? null;
          setExtractedName(geminiName);
          // Pre-fill name from Gemini if user hasn't typed yet
          setName((prev) => prev || geminiName || "");
          setScanDone(true);
          return true;
        }
      } catch {
        // malformed data — keep polling
      }
      return false;
    };

    if (tryLoad()) return;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryLoad() || attempts > 60) {
        clearInterval(interval);
        if (attempts > 60) setScanTimedOut(true);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [scanKey]);

  // Auto-focus name input once scan data arrives
  useEffect(() => {
    if (scanDone) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [scanDone]);

  // ─── Confirm ─────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!name.trim() || saving) return;

    const confirmedName = name.trim();
    updateScanResult(scanKey, { restaurantName: confirmedName });

    setSaving(true);
    setSaveError(false);
    try {
      const result = await autoSaveToSupabase(scanKey);
      const restaurantId = result?.restaurantId ?? null;
      const dishCount = result ? Object.keys(result.dishToRecipeMap).length : 0;

      if (restaurantId) {
        enrich(scanKey, result.dishToRecipeMap);
        setToast({ restaurantName: confirmedName, dishCount });
        setTimeout(() => {
          router.replace(
            `/restaurants/${restaurantId}?name=${encodeURIComponent(confirmedName)}`
          );
        }, 1200);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const canConfirm = name.trim().length > 0 && scanDone && !saving;

  return (
    <div
      className="scroll-content"
      style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}
    >
      {/* ── Sticky name section ───────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 px-4 pb-4"
        style={{
          paddingTop: "calc(var(--space-safe-top, env(safe-area-inset-top, 0px)) + 16px)",
          background: "var(--glass-elevated)",
          backdropFilter: "var(--blur-elevated)",
          WebkitBackdropFilter: "var(--blur-elevated)",
          borderBottom: "1px solid rgba(180,170,158,0.18)",
        }}
      >
        {/* Heading */}
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Restaurant name
        </p>

        {/* Name input */}
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleConfirm(); }}
          placeholder={
            scanDone
              ? (extractedName ? `e.g. ${extractedName}` : "Enter restaurant name")
              : "Scanning…"
          }
          disabled={saving}
          aria-label="Restaurant name"
          className="w-full text-base"
          style={{
            height: 44,
            paddingLeft: 14,
            paddingRight: 14,
            background: "rgba(180,170,158,0.14)",
            border: "1px solid rgba(180,170,158,0.22)",
            borderRadius: 12,
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-body), system-ui, sans-serif",
            fontSize: 15,
            outline: "none",
            appearance: "none",
          }}
        />

        {/* Confirm button — appears once dishes are ready */}
        <AnimatePresence>
          {scanDone && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 10 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={!canConfirm}
                aria-label="Confirm restaurant name and save"
                className="w-full font-semibold"
                style={{
                  height: 48,
                  borderRadius: 9999,
                  border: "none",
                  background: canConfirm ? "var(--color-accent)" : "rgba(180,170,158,0.22)",
                  color: canConfirm ? "var(--color-on-accent, #fff)" : "var(--color-text-tertiary)",
                  fontSize: 15,
                  cursor: canConfirm ? "pointer" : "default",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                {saving ? "Saving…" : "Confirm"}
              </button>

              {saveError && (
                <p
                  className="text-sm text-center mt-2"
                  style={{ color: "rgba(184,59,59,0.9)" }}
                  role="alert"
                >
                  Couldn&apos;t save — try again
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="px-4 pb-[calc(var(--tab-bar-height,80px)+var(--space-safe-bottom,env(safe-area-inset-bottom,0px))+24px)]">

        {/* Timeout error */}
        {scanTimedOut && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p
              className="text-sm text-center"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Couldn&apos;t complete the scan. Please try again.
            </p>
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-pill btn-ghost text-sm"
            >
              Go back
            </button>
          </div>
        )}

        {/* Scanning loader */}
        {!scanDone && !scanTimedOut && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <ScanningSpinner />
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Scanning your menu…
            </p>
          </div>
        )}

        {/* Dish preview cards */}
        {scanDone && dishes.length > 0 && (
          <div className="flex flex-col gap-3 pt-4">
            {dishes.map((dish, idx) => (
              <DishPreviewCard key={dish.id ?? `dish-${idx}`} dish={dish} />
            ))}
          </div>
        )}
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <AutoCaptureToast
            restaurantName={toast.restaurantName}
            dishCount={toast.dishCount}
            onDismiss={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── DishPreviewCard ─────────────────────────────────────────────────────────

function DishPreviewCard({ dish }: { dish: StoredDish }) {
  const calories =
    typeof dish.calorieEstimate === "number" && dish.calorieEstimate > 0
      ? Math.round(dish.calorieEstimate)
      : null;

  return (
    <div
      style={{
        background: "var(--glass-base)",
        backdropFilter: "var(--blur-base)",
        WebkitBackdropFilter: "var(--blur-base)",
        border: "var(--border-glass)",
        borderRadius: 16,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          lineHeight: 1.3,
        }}
      >
        {dish.name}
      </p>
      {calories != null && (
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-accent)",
            lineHeight: 1,
          }}
        >
          {calories} cal
        </p>
      )}
      {dish.description && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {dish.description}
        </p>
      )}
    </div>
  );
}

// ─── ScanningSpinner ─────────────────────────────────────────────────────────

function ScanningSpinner() {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "2.5px solid rgba(180,170,158,0.28)",
        borderTopColor: "var(--color-accent)",
        animation: "spin 0.9s linear infinite",
      }}
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
