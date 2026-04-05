"use client";

import { useEffect, useRef, useState } from "react";

interface AtmosphericBackgroundProps {
  imageUrl?: string | null;
}

export function AtmosphericBackground({ imageUrl }: AtmosphericBackgroundProps) {
  const [current, setCurrent] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (imageUrl === current) return;

    if (!current) {
      // First image — just set directly
      setCurrent(imageUrl ?? null);
      return;
    }

    // Crossfade to new image
    setNext(imageUrl ?? null);
    setTransitioning(true);

    const timer = setTimeout(() => {
      setCurrent(imageUrl ?? null);
      setNext(null);
      setTransitioning(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [imageUrl, current]);

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

      <div className="atmospheric-bg__overlay" aria-hidden="true" />
    </div>
  );
}
