"use client";

import { useEffect, useRef, useState } from "react";
import { extractPalette, type PaletteResult } from "@/lib/palette";
import { useUpdateAtmosphericPalette } from "@/hooks/useRestaurants";

interface AtmosphericBackgroundProps {
  imageUrl?: string | null;
  /** When provided, the extracted palette is persisted to this restaurant row. */
  restaurantId?: string;
}

export function AtmosphericBackground({ imageUrl, restaurantId }: AtmosphericBackgroundProps) {
  const [current, setCurrent] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Palette state — updated whenever imageUrl changes
  const [palette, setPalette] = useState<PaletteResult | null>(null);
  const paletteAbortRef = useRef<AbortController | null>(null);

  // Track which (imageUrl, restaurantId) pair has already been persisted so we
  // don't write to Supabase on every render or re-extraction of the same image.
  const persistedKeyRef = useRef<string | null>(null);

  const updatePalette = useUpdateAtmosphericPalette();

  // ── Crossfade logic (unchanged) ───────────────────────────
  useEffect(() => {
    if (imageUrl === current) return;

    if (!current) {
      setCurrent(imageUrl ?? null);
      return;
    }

    setNext(imageUrl ?? null);
    setTransitioning(true);

    const timer = setTimeout(() => {
      setCurrent(imageUrl ?? null);
      setNext(null);
      setTransitioning(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [imageUrl, current]);

  // ── Palette extraction ────────────────────────────────────
  // Runs whenever imageUrl changes. Extraction is async so we guard against
  // stale results with an abort signal (AbortController used as a cancel flag).
  useEffect(() => {
    // Cancel any in-flight extraction for the previous URL
    paletteAbortRef.current?.abort();
    const controller = new AbortController();
    paletteAbortRef.current = controller;

    if (!imageUrl) {
      setPalette(null);
      return;
    }

    extractPalette(imageUrl).then((result) => {
      // Drop the result if a newer extraction has been started
      if (controller.signal.aborted) return;
      setPalette(result);

      // Persist the palette to Supabase — fire-and-forget, once per
      // (imageUrl + restaurantId) pair. Only runs when both are available
      // and we have a valid extraction result.
      if (result && restaurantId) {
        const persistKey = `${restaurantId}::${imageUrl}`;
        if (persistedKeyRef.current !== persistKey) {
          persistedKeyRef.current = persistKey;
          updatePalette.mutate({
            restaurantId,
            palette: {
              primary: result.dominant,
              secondary: result.muted,
              accent: result.dominant,
            },
          });
        }
      }
    });

    return () => {
      controller.abort();
    };
  }, [imageUrl]);

  // ── Derive tinted overlay gradient ───────────────────────
  // When a palette is available, blend the dominant color (at low opacity) into
  // the existing warm-cream overlay so the background takes on the dish's color
  // temperature. Falls back to the hardcoded gradient if extraction fails.
  const overlayStyle = palette
    ? {
        background: [
          `linear-gradient(`,
          `  180deg,`,
          `  rgba(250, 250, 247, 0.55) 0%,`,
          `  ${hexToRgba(palette.dominant, 0.18)} 30%,`,
          `  ${palette.muted} 60%,`,
          `  rgba(239, 237, 230, 0.88) 100%`,
          `)`,
        ].join(""),
      }
    : undefined; // falls back to .atmospheric-bg__overlay CSS

  return (
    <div className="atmospheric-bg">
      {/* Current image */}
      {current && (
        <img
          src={current}
          alt=""
          aria-hidden="true"
          className="atmospheric-bg__image"
          style={{ opacity: transitioning ? 0 : 1 }}
        />
      )}

      {/* Next image (fades in during transition) */}
      {next && transitioning && (
        <img
          src={next}
          alt=""
          aria-hidden="true"
          className="atmospheric-bg__image"
          style={{ opacity: 1 }}
        />
      )}

      {/* Fallback warm gradient when no image */}
      {!current && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, #F4EFE6 0%, #E8E0D4 50%, #DDD5C8 100%)",
          }}
          aria-hidden="true"
        />
      )}

      {/* Overlay — tinted by extracted palette when available */}
      <div
        className="atmospheric-bg__overlay"
        style={overlayStyle}
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Utility ─────────────────────────────────────────────────

/** Convert a 6-digit hex color string to an rgba(...) CSS value. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
