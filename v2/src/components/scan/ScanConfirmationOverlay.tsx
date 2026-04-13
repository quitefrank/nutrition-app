"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { RestaurantConfirmation, type RestaurantInfo } from "@/components/scan/RestaurantConfirmation";
import { AutoCaptureToast } from "@/components/scan/AutoCaptureToast";
import { autoSaveToSupabase } from "@/lib/supabaseAutoSave";

interface ScanConfirmationOverlayProps {
  /** sessionStorage key for the scan result (format: `plately:scan:{uuid}`) */
  scanKey: string;
  /** Called with the first saved recipe UUID when the save is complete */
  onComplete: (firstRecipeId: string | null) => void;
  /** Called when the overlay should be dismissed without a save result (e.g. session error) */
  onClose: () => void;
}

interface StoredScanResult {
  type?: string;
  restaurantName?: string | null;
  allDishes?: Array<{ name: string }>;
  enriched?: boolean;
}

function readScanResult(scanKey: string): StoredScanResult | null {
  try {
    const raw = sessionStorage.getItem(scanKey);
    if (!raw) return null;
    return JSON.parse(raw) as StoredScanResult;
  } catch {
    return null;
  }
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

export function ScanConfirmationOverlay({ scanKey, onComplete, onClose }: ScanConfirmationOverlayProps) {
  // Read sessionStorage once on mount — avoids stale re-reads on re-renders
  const scanResultRef = useRef(readScanResult(scanKey));
  const [saving, setSaving] = useState(false);
  // P1: recipeId stored in toast state so the toast's own onDismiss calls onComplete —
  // eliminating the dual-timer race between the overlay setTimeout and the toast timer.
  const [toast, setToast] = useState<{ name: string; count: number; recipeId: string | null } | null>(null);

  // P3: Guard setState calls after unmount (e.g. if parent replaces confirmingScanKey mid-save)
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Keep a stable ref to onClose so the effect below doesn't re-run on re-renders
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // P10: If sessionStorage is unavailable or the key has expired, close immediately
  useEffect(() => {
    if (!scanResultRef.current) {
      onCloseRef.current();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!scanResultRef.current) return null;

  const scanResult = scanResultRef.current;
  const extractedName = scanResult.restaurantName ?? null;
  const dishCount = scanResult.allDishes?.length ?? 0;

  async function handleConfirm(restaurant: RestaurantInfo) {
    // Write confirmed restaurant info to sessionStorage before saving.
    // updateScanResult is synchronous — autoSaveToSupabase reads sessionStorage
    // at the top of its execution, so the restaurant patch is guaranteed visible
    // before any async interleaving with the concurrent fireEnrichment call.
    updateScanResult(scanKey, {
      restaurantName: restaurant.name,
      restaurantPlaceId: restaurant.placeId || null,
      restaurantAddress: restaurant.address ?? null,
      restaurantRating: restaurant.rating ?? null,
      restaurantUserRatingsTotal: restaurant.userRatingsTotal ?? null,
    });

    if (isMountedRef.current) setSaving(true);
    try {
      const map = await autoSaveToSupabase(scanKey);
      const firstRecipeId = map ? Object.values(map)[0] ?? null : null;
      const savedCount = map ? Object.keys(map).length : dishCount;

      if (isMountedRef.current) {
        setToast({ name: restaurant.name, count: savedCount, recipeId: firstRecipeId });
      }
    } catch {
      // Auto-save failure — surface as null so AppShell can show error state
      onComplete(null);
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  }

  async function handleSkip() {
    // P5: Snapshot name before the async save — fireEnrichment may write to
    // sessionStorage concurrently and overwrite restaurantName after the await.
    const nameSnapshot = extractedName ?? "Restaurant";

    if (isMountedRef.current) setSaving(true);
    try {
      const map = await autoSaveToSupabase(scanKey);
      const firstRecipeId = map ? Object.values(map)[0] ?? null : null;
      const savedCount = map ? Object.keys(map).length : dishCount;

      if (isMountedRef.current) {
        setToast({ name: nameSnapshot, count: savedCount, recipeId: firstRecipeId });
      }
    } catch {
      onComplete(null);
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  }

  return (
    <>
      {/* Confirmation card — hidden while saving or toast is showing */}
      {!toast && !saving && (
        <div
          className="fixed inset-x-0 z-40 px-4"
          style={{
            bottom: "calc(max(env(safe-area-inset-bottom, 0px), 8px) + 96px)",
          }}
        >
          <RestaurantConfirmation
            scanKey={scanKey}
            extractedName={extractedName}
            onConfirm={handleConfirm}
            onSkip={handleSkip}
          />
        </div>
      )}

      {/* P8: Saving indicator with visible text content for sighted and SR users */}
      {saving && !toast && (
        <div
          className="fixed inset-x-0 z-40 flex justify-center px-4"
          style={{
            bottom: "calc(max(env(safe-area-inset-bottom, 0px), 8px) + 96px)",
          }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
            aria-live="polite"
          >
            Saving dishes…
          </p>
        </div>
      )}

      {/* Auto-capture toast */}
      <AnimatePresence>
        {toast && (
          <AutoCaptureToast
            restaurantName={toast.name}
            dishCount={toast.count}
            // P1: Single timer source — the toast's own 2500ms timer fires onDismiss,
            // which calls onComplete. This eliminates the dual-timer race between the
            // overlay's setTimeout and AutoCaptureToast's internal timer.
            onDismiss={() => onComplete(toast.recipeId)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
