"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { autoSaveToSupabase } from "@/lib/supabaseAutoSave";
import { useEnrichment } from "@/hooks/useEnrichment";
import { AutoCaptureToast } from "@/components/scan/AutoCaptureToast";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { RestaurantCard } from "@/components/ui/RestaurantCard";
import type { RestaurantCardResult } from "@/components/ui/RestaurantCard";
import { supabase } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────────────────────

// PlaceResult shape matches RestaurantCardResult — using the shared type directly.

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

// ─── Places photo enrichment (fire-and-forget) ───────────────────────────────

async function enrichRestaurantFromPlaces(
  restaurantId: string,
  restaurantName: string,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  try {
    const res = await fetch("/api/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: restaurantName }),
    });
    if (!res.ok) return;
    const { data } = await res.json() as {
      data?: Array<{ placeId: string; photoUrl: string | null }>;
    };
    const first = data?.[0];
    if (!first?.placeId || !first.photoUrl) return;

    // Update restaurant with placeId + cover photo
    const { error: restaurantErr } = await supabase
      .from("restaurants")
      .update({ place_id: first.placeId, reference_image_url: first.photoUrl })
      .eq("id", restaurantId);
    if (restaurantErr) return;

    // Assign the same photo to all placeholder recipes for this restaurant
    await supabase
      .from("recipes")
      .update({ dish_image_url: first.photoUrl, photo_status: "confirmed" })
      .eq("restaurant_id", restaurantId)
      .eq("photo_status", "placeholder");

    // Invalidate so the restaurant page refetches and shows the new photos
    void queryClient.invalidateQueries({ queryKey: ["restaurant"] });
    void queryClient.invalidateQueries({ queryKey: ["recipes"] });
  } catch {
    // Best-effort — photos are non-critical
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
  const [placeResults, setPlaceResults] = useState<RestaurantCardResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<RestaurantCardResult | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoConfirmPlaceRef = useRef<RestaurantCardResult | null>(null);
  const { enrich } = useEnrichment();
  const queryClient = useQueryClient();

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
        const data = JSON.parse(raw) as StoredScanResult & { error?: string };
        // CameraModal writes { error: msg } on API failure — surface it immediately
        if (data.error) {
          setScanTimedOut(true);
          return true;
        }
        // Phase 1: name-only result from /api/scan/name arrives before dishes.
        // Pre-fill the input so the user sees the restaurant name immediately.
        if (data.restaurantName) {
          const earlyName = data.restaurantName;
          setExtractedName(earlyName);
          setName((prev) => prev || earlyName);
        }
        // Phase 2: full scan result — dishes ready, confirm can fire
        if (data.allDishes && data.allDishes.length > 0) {
          setDishes(data.allDishes);
          const geminiName = data.restaurantName ?? null;
          setExtractedName(geminiName);
          // Only pre-fill if user hasn't typed yet (preserves any name from Phase 1)
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

  // Auto-confirm when scan completes if a card was selected before the scan finished
  useEffect(() => {
    if (!scanDone) return;
    const place = autoConfirmPlaceRef.current;
    if (!place || saving) return;
    autoConfirmPlaceRef.current = null;
    void handleConfirm(place);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanDone]);

  // ─── Track sticky header height for overlay positioning ──────────────────
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Debounced Places search ──────────────────────────────────────────────
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      setPlaceResults([]);
      return;
    }
    // Clear a prior selection if the user edits the field manually
    setSelectedPlace(null);

    const tid = setTimeout(() => {
      setPlaceLoading(true);
      fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      })
        .then((r) => r.json())
        .then((json) => {
          const raw = (json.data ?? []) as RestaurantCardResult[];
          setPlaceResults(raw.map((r) => ({
            placeId: r.placeId,
            name: r.name,
            address: r.address,
            rating: r.rating ?? null,
            userRatingCount: r.userRatingCount ?? null,
            photoUrl: r.photoUrl ?? null,
          })));
        })
        .catch(() => { /* best-effort */ })
        .finally(() => setPlaceLoading(false));
    }, 300);

    return () => clearTimeout(tid);
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Confirm ─────────────────────────────────────────────────────────────

  async function handleConfirm(overridePlace?: RestaurantCardResult) {
    const confirmedPlace = overridePlace ?? selectedPlace;
    const confirmedName = (overridePlace?.name ?? name).trim();
    if (!confirmedName || saving || !scanDone) return;

    updateScanResult(scanKey, {
      restaurantName: confirmedName,
      ...(confirmedPlace
        ? {
            restaurantPlaceId: confirmedPlace.placeId,
            restaurantRating: confirmedPlace.rating ?? null,
            restaurantUserRatingsTotal: confirmedPlace.userRatingCount ?? null,
          }
        : {}),
    });

    setSaving(true);
    setSaveError(false);
    try {
      const result = await autoSaveToSupabase(scanKey);
      const restaurantId = result?.restaurantId ?? null;
      const dishCount = result ? Object.keys(result.dishToRecipeMap).length : 0;

      if (restaurantId && result) {
        enrich(scanKey, result.dishToRecipeMap);
        void enrichRestaurantFromPlaces(restaurantId, confirmedName, queryClient);
        setToast({ restaurantName: confirmedName, dishCount });
        const navigationId = confirmedPlace?.placeId ?? restaurantId;
        setTimeout(() => {
          router.replace(
            `/restaurants/${encodeURIComponent(navigationId)}?name=${encodeURIComponent(confirmedName)}`
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

  return (
    <div
      className="scroll-content"
      style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", position: "relative" }}
    >
      {/* ── Sticky name section ───────────────────────────────────────────── */}
      <div
        ref={headerRef}
        className="sticky top-0 z-20 px-4 pb-4"
        style={{
          paddingTop: "calc(var(--space-safe-top, env(safe-area-inset-top, 0px)) + 16px)",
          background: "var(--glass-elevated)",
          backdropFilter: "var(--blur-elevated)",
          WebkitBackdropFilter: "var(--blur-elevated)",
          borderBottom: "1px solid rgba(180,170,158,0.18)",
        }}
      >
        {/* Name input */}
        <FrostedCard noPadding className="overflow-hidden">
          <div className="flex items-center gap-3 px-4 h-[52px]">
            <SearchInputIcon />
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
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--color-text-tertiary)]"
              style={{
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
            />
            {placeLoading && <SpinnerIcon />}
            {!placeLoading && name.length > 0 && (
              <button
                onClick={() => setName("")}
                aria-label="Clear restaurant name"
                className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
                style={{ background: "rgba(180,170,158,0.28)" }}
              >
                <ClearIcon />
              </button>
            )}
          </div>
        </FrostedCard>

        {/* Confirm button — appears when scan is done, name is filled, and no Places overlay is open */}
        <AnimatePresence>
          {scanDone && name.trim().length > 0 && placeResults.length === 0 && !saving && (
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
                aria-label="Confirm restaurant name and save"
                className="w-full font-semibold"
                style={{
                  height: 48,
                  borderRadius: 9999,
                  border: "none",
                  background: "var(--color-accent)",
                  color: "var(--color-on-accent, #fff)",
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                Confirm
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Saving state — replaces the confirm button while the save is in flight */}
        <AnimatePresence>
          {saving && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 10 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <div
                className="w-full flex items-center justify-center font-semibold"
                style={{
                  height: 48,
                  borderRadius: 9999,
                  background: "rgba(180,170,158,0.22)",
                  color: "var(--color-text-tertiary)",
                  fontSize: 15,
                }}
              >
                Saving…
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Save error — shown inline below the button when confirm fails */}
        {saveError && (
          <p
            className="text-sm text-center mt-2"
            style={{ color: "rgba(184,59,59,0.9)" }}
            role="alert"
          >
            Couldn&apos;t save — try again
          </p>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="px-4 pb-[calc(var(--tab-bar-height,80px)+var(--space-safe-bottom,env(safe-area-inset-bottom,0px))+24px)]">

        {/* ── Google Places suggestions — absolute overlay above dish cards ── */}
        <AnimatePresence>
          {placeResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "absolute",
                top: headerHeight,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10,
                overflowY: "auto",
                background: "var(--color-base)",
                paddingBottom: "calc(var(--tab-bar-height, 80px) + var(--space-safe-bottom, env(safe-area-inset-bottom, 0px)) + 24px)",
              }}
            >
              <div className="flex flex-col gap-1.5 px-4 pt-3">
                {placeResults.map((place) => (
                  <RestaurantCard
                    key={place.placeId}
                    result={place}
                    onTap={(r) => {
                      setName(r.name);
                      setSelectedPlace(r);
                      setPlaceResults([]);
                      if (scanDone && !saving) {
                        void handleConfirm(r);
                      } else {
                        autoConfirmPlaceRef.current = r;
                      }
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* Scanning state: spinner + skeleton cards */}
        {!scanDone && !scanTimedOut && (
          <div className="flex flex-col gap-3 pt-4">
            <div className="flex items-center gap-3 pb-2">
              <ScanningSpinner />
              <p
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Scanning your menu…
              </p>
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <DishSkeletonCard key={i} />
            ))}
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

// ─── DishSkeletonCard ────────────────────────────────────────────────────────

function DishSkeletonCard() {
  return (
    <div
      aria-hidden="true"
      style={{
        background: "var(--glass-base)",
        backdropFilter: "var(--blur-base)",
        WebkitBackdropFilter: "var(--blur-base)",
        border: "var(--border-glass)",
        borderRadius: 16,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Name line */}
      <div
        className="animate-pulse"
        style={{
          height: 14,
          width: "58%",
          borderRadius: 6,
          background: "rgba(180,170,158,0.22)",
        }}
      />
      {/* Calorie line */}
      <div
        className="animate-pulse"
        style={{
          height: 12,
          width: "22%",
          borderRadius: 6,
          background: "rgba(180,170,158,0.16)",
        }}
      />
      {/* Description lines */}
      <div
        className="animate-pulse"
        style={{
          height: 11,
          width: "88%",
          borderRadius: 6,
          background: "rgba(180,170,158,0.14)",
        }}
      />
      <div
        className="animate-pulse"
        style={{
          height: 11,
          width: "72%",
          borderRadius: 6,
          background: "rgba(180,170,158,0.12)",
        }}
      />
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

// ─── Input icons ─────────────────────────────────────────────────────────────

function SearchInputIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="7" stroke="var(--color-text-tertiary)" strokeWidth="1.75" />
      <path d="M16.5 16.5L21 21" stroke="var(--color-text-tertiary)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      aria-label="Loading"
      style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="var(--color-text-tertiary)"
        strokeWidth="2.5"
        strokeDasharray="14 42"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="var(--color-text-secondary)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
