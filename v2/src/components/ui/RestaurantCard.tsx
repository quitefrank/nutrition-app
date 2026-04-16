"use client";

import { FrostedCard } from "@/components/ui/FrostedCard";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RestaurantCardResult {
  placeId: string;
  name: string;
  address?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  photoUrl?: string | null;
}

// ─── RestaurantCard ─────────────────────────────────────────────────────────────

export function RestaurantCard({
  result,
  onTap,
}: {
  result: RestaurantCardResult;
  onTap: (result: RestaurantCardResult) => void;
}) {
  return (
    <FrostedCard
      noPadding
      className="flex gap-3 p-3 cursor-pointer overflow-hidden focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
      onClick={() => onTap(result)}
      role="button"
      tabIndex={0}
      aria-label={`View ${result.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap(result);
        }
      }}
    >
      {/* Thumbnail */}
      {result.photoUrl ? (
        <img
          src={result.photoUrl}
          alt={result.name}
          className="rounded-lg object-cover flex-shrink-0"
          style={{ width: 56, height: 56 }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ width: 56, height: 56, background: "var(--color-surface)" }}
        >
          <UtensilsIcon />
        </div>
      )}

      {/* Text */}
      <div className="flex flex-col justify-center gap-0.5 min-w-0">
        <p
          className="text-sm font-semibold truncate"
          style={{ color: "var(--color-text-primary)" }}
        >
          {result.name}
        </p>
        {result.address && (
          <p
            className="text-xs truncate"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {result.address}
          </p>
        )}
        {result.rating != null && (
          <div className="flex items-center gap-1 mt-0.5">
            <StarIcon />
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1 }}>
              {result.rating.toFixed(1)}
            </span>
            {result.userRatingCount != null && (
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1 }}>
                ({result.userRatingCount.toLocaleString()})
              </span>
            )}
          </div>
        )}
      </div>
    </FrostedCard>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────────

function StarIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="var(--color-accent)"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function UtensilsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"
        stroke="var(--color-text-tertiary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 2v20"
        stroke="var(--color-text-tertiary)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"
        stroke="var(--color-text-tertiary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
