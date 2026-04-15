"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ─────────────────────────────────────────────────

export interface RestaurantInfo {
  placeId: string;
  name: string;
  address?: string;
  rating?: number | null;
  userRatingsTotal?: number | null;
}

interface RestaurantConfirmationProps {
  /** Called when the user confirms a restaurant selection */
  onConfirm: (restaurant: RestaurantInfo) => void;
  /** Called when the user skips */
  onSkip: () => void;
  /**
   * When provided, the component starts in name-confirm mode: the user sees a
   * pre-filled editable name and can confirm, edit, or switch to search.
   */
  scanKey?: string;
  /** Pre-filled restaurant name extracted from the Gemini scan result. */
  extractedName?: string | null;
}

type Mode = "confirm" | "idle" | "gps" | "text";
type GpsState = "loading" | "ready" | "error";

// ─── Hook: debounced value ─────────────────────────────────

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ─── RestaurantConfirmation ────────────────────────────────

export function RestaurantConfirmation({
  onConfirm,
  onSkip,
  scanKey,
  extractedName,
}: RestaurantConfirmationProps) {
  // When a scanKey is provided we start in name-confirm mode; otherwise search mode
  const [mode, setMode] = useState<Mode>(scanKey !== undefined ? "confirm" : "idle");
  const [confirmedName, setConfirmedName] = useState(extractedName ?? "");
  const [gpsState, setGpsState] = useState<GpsState>("loading");
  const [nearbyPlaces, setNearbyPlaces] = useState<RestaurantInfo[]>([]);
  const [textQuery, setTextQuery] = useState("");
  const [textResults, setTextResults] = useState<RestaurantInfo[]>([]);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounced(textQuery, 300);

  // Auto-focus text input when switching to text mode
  useEffect(() => {
    if (mode === "text") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  // Text search effect
  useEffect(() => {
    if (debouncedQuery.trim().length < 3) {
      setTextResults([]);
      setTextError(false);
      return;
    }

    let cancelled = false;
    setTextLoading(true);
    setTextError(false);

    fetch("/api/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: debouncedQuery }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setTextResults(
          (json.data ?? []).map(
            (r: { placeId: string; name: string; address?: string; rating?: number | null; userRatingsTotal?: number | null }) => ({
              placeId: r.placeId,
              name: r.name,
              address: r.address ?? "",
              rating: r.rating ?? null,
              userRatingsTotal: r.userRatingsTotal ?? null,
            })
          )
        );
      })
      .catch(() => {
        if (!cancelled) setTextError(true);
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const requestGps = () => {
    setMode("gps");
    setGpsState("loading");
    setNearbyPlaces([]);

    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lng } }) => {
        try {
          const res = await fetch("/api/places/nearby", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng, radius: 200 }),
          });
          if (!res.ok) { setGpsState("error"); return; }
          const json = await res.json();
          setNearbyPlaces(
            (json.data ?? []).map(
              (p: { placeId: string; name: string; address?: string; rating?: number | null; userRatingsTotal?: number | null }) => ({
                placeId: p.placeId,
                name: p.name,
                address: p.address ?? "",
                rating: p.rating ?? null,
                userRatingsTotal: p.userRatingsTotal ?? null,
              })
            )
          );
          setGpsState("ready");
        } catch {
          setGpsState("error");
        }
      },
      () => setGpsState("error"),
      { timeout: 10_000 }
    );
  };

  // Frosted glass styles applied directly on motion.div (the Framer Motion compositor
  // layer). backdrop-filter must live on the composited element itself — applying it
  // to a child of a transformed element prevents it from seeing content outside the
  // compositor layer, which is why the card appeared opaque before.
  const frostedStyle: React.CSSProperties = {
    background: "var(--glass-base)",
    backdropFilter: "var(--blur-base)",
    WebkitBackdropFilter: "var(--blur-base)",
    border: "var(--border-glass)",
    boxShadow: "var(--shadow-card)",
  };

  const cardAnim = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 28, stiffness: 360 } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
  };

  return (
    <AnimatePresence mode="wait">
      {mode === "confirm" && (
        <motion.div key="confirm" {...cardAnim} className="flex flex-col gap-3 p-4 rounded-[24px]" style={frostedStyle}>
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "var(--color-accent-light)" }}
                aria-hidden="true"
              >
                <PinIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--color-text-primary)" }}>
                  Confirm restaurant name
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  We&apos;ll save all dishes under this restaurant.
                </p>
              </div>
            </div>

            {/* Editable name field */}
            <div
              className="flex items-center gap-2 px-3 rounded-xl"
              style={{
                height: 44,
                background: "rgba(180,170,158,0.14)",
                border: "1px solid rgba(180,170,158,0.22)",
              }}
            >
              <input
                type="text"
                placeholder="Enter restaurant name or skip"
                value={confirmedName}
                onChange={(e) => setConfirmedName(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "var(--color-text-primary)" }}
                aria-label="Restaurant name"
                autoFocus
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onConfirm({ placeId: "", name: confirmedName.trim() || "Unknown Restaurant" })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "#fff", minHeight: 44 }}
                aria-label="Confirm restaurant name"
              >
                Confirm
              </button>
              <button
                onClick={() => setMode("idle")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(180,170,158,0.18)",
                  color: "var(--color-text-primary)",
                  minHeight: 44,
                }}
                aria-label="Search instead"
              >
                Search instead
              </button>
              <button
                onClick={onSkip}
                className="flex items-center px-3 py-2 rounded-full text-xs"
                style={{ color: "var(--color-text-tertiary)", minHeight: 44 }}
                aria-label="Skip restaurant identification"
              >
                Skip
              </button>
            </div>
        </motion.div>
      )}

      {mode === "idle" && (
        <motion.div key="idle" {...cardAnim} className="flex flex-col gap-3 p-4 rounded-[24px]" style={frostedStyle}>
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "var(--color-accent-light)" }}
                aria-hidden="true"
              >
                <PinIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--color-text-primary)" }}>
                  Which restaurant is this from?
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  We&apos;ll link it to this location so you can browse it later.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={requestGps}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "#fff", minHeight: 44 }}
                aria-label="Use my location to find nearby restaurants"
              >
                <LocationIcon />
                Use my location
              </button>
              <button
                onClick={() => setMode("text")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(180,170,158,0.18)",
                  color: "var(--color-text-primary)",
                  minHeight: 44,
                }}
                aria-label="Search by restaurant name"
              >
                <SearchIcon />
                Enter name
              </button>
              <button
                onClick={onSkip}
                className="flex items-center px-3 py-2 rounded-full text-xs"
                style={{ color: "var(--color-text-tertiary)", minHeight: 44 }}
                aria-label="Skip restaurant identification"
              >
                Skip
              </button>
            </div>
        </motion.div>
      )}

      {mode === "gps" && (
        <motion.div key="gps" {...cardAnim} className="flex flex-col gap-3 p-4 rounded-[24px]" style={frostedStyle}>
            {gpsState === "loading" && (
              <div className="flex items-center gap-3">
                <SpinnerIcon />
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Finding nearby restaurants…
                </p>
              </div>
            )}

            {gpsState === "error" && (
              <>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Could not get your location. Try searching by name instead.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setMode("text")}
                    className="flex items-center px-3 py-2 rounded-full text-xs font-medium"
                    style={{ background: "var(--color-accent)", color: "#fff", minHeight: 44 }}
                  >
                    Enter name
                  </button>
                  <button
                    onClick={onSkip}
                    className="flex items-center px-3 py-2 rounded-full text-xs"
                    style={{ color: "var(--color-text-tertiary)", minHeight: 44 }}
                  >
                    Skip
                  </button>
                </div>
              </>
            )}

            {gpsState === "ready" && nearbyPlaces.length === 0 && (
              <>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  No restaurants found nearby. Try entering the name instead.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setMode("text")}
                    className="flex items-center px-3 py-2 rounded-full text-xs font-medium"
                    style={{ background: "var(--color-accent)", color: "#fff", minHeight: 44 }}
                  >
                    Enter name
                  </button>
                  <button
                    onClick={onSkip}
                    className="flex items-center px-3 py-2 rounded-full text-xs"
                    style={{ color: "var(--color-text-tertiary)", minHeight: 44 }}
                  >
                    Skip
                  </button>
                </div>
              </>
            )}

            {gpsState === "ready" && nearbyPlaces.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-tertiary)" }}>
                  Nearby restaurants
                </p>
                <div className="flex flex-col gap-1.5">
                  {nearbyPlaces.map((place) => (
                    <RestaurantRow
                      key={place.placeId}
                      restaurant={place}
                      onSelect={onConfirm}
                    />
                  ))}
                </div>
                <button
                  onClick={onSkip}
                  className="flex items-center text-xs self-start"
                  style={{ color: "var(--color-text-tertiary)", minHeight: 44 }}
                >
                  None of these
                </button>
              </>
            )}
        </motion.div>
      )}

      {mode === "text" && (
        <motion.div key="text" {...cardAnim} className="flex flex-col gap-3 p-4 rounded-[24px]" style={frostedStyle}>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-tertiary)" }}>
              Search by name
            </p>

            {/* Search input */}
            <div
              className="flex items-center gap-2 px-3 rounded-xl"
              style={{
                height: 44,
                background: "rgba(180,170,158,0.14)",
                border: "1px solid rgba(180,170,158,0.22)",
              }}
            >
              <SearchIcon />
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g. Trattoria Roma"
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "var(--color-text-primary)" }}
                aria-label="Restaurant name search"
              />
              {textLoading && <SpinnerIcon />}
            </div>

            {/* Results */}
            {textResults.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {textResults.map((r) => (
                  <RestaurantRow
                    key={r.placeId}
                    restaurant={r}
                    onSelect={onConfirm}
                  />
                ))}
              </div>
            )}

            {!textLoading && debouncedQuery.trim().length >= 3 && textResults.length === 0 && !textError && (
              <p className="text-xs text-center py-1" style={{ color: "var(--color-text-tertiary)" }}>
                No restaurants found.
              </p>
            )}

            {textError && (
              <p className="text-xs text-center py-1" style={{ color: "var(--color-error)" }}>
                Search unavailable — try again.
              </p>
            )}

            <button
              onClick={onSkip}
              className="flex items-center text-xs self-start"
              style={{ color: "var(--color-text-tertiary)", minHeight: 44 }}
            >
              Skip
            </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── RestaurantRow sub-component ──────────────────────────

function RestaurantRow({
  restaurant,
  onSelect,
}: {
  restaurant: RestaurantInfo;
  onSelect: (r: RestaurantInfo) => void;
}) {
  return (
    <motion.button
      onClick={() => onSelect(restaurant)}
      className="w-full flex flex-col items-start px-3 py-2.5 rounded-xl text-left"
      style={{
        background: "rgba(196,98,45,0.07)",
        border: "1px solid rgba(196,98,45,0.15)",
        minHeight: 44,
      }}
      whileTap={{ scale: 0.98 }}
      aria-label={`Select ${restaurant.name}`}
    >
      <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
        {restaurant.name}
      </span>
      {restaurant.address && (
        <span className="text-xs mt-0.5 leading-snug" style={{ color: "var(--color-text-secondary)" }}>
          {restaurant.address}
        </span>
      )}
    </motion.button>
  );
}

// ─── Icons ─────────────────────────────────────────────────

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2.5" stroke="var(--color-accent)" strokeWidth="1.75" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="var(--color-text-tertiary)" strokeWidth="1.75" />
      <path d="M16.5 16.5L21 21" stroke="var(--color-text-tertiary)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "spin 0.9s linear infinite" }}>
      <circle cx="12" cy="12" r="9" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeDasharray="14 42" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
