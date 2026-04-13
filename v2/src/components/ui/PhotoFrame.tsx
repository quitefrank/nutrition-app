/**
 * PhotoFrame — three-state photo component for dish cards.
 *
 * States:
 *   confirmed   — renders <Image> with the resolved photo URL; degrades to placeholder on load error
 *   placeholder — renders a warm tile with plate icon and "No photo available" label
 *   suppressed  — returns null (card should not be rendered at all; handled by DishCard)
 *
 * The parent is responsible for not rendering PhotoFrame when photoStatus is
 * 'suppressed'. PhotoFrame itself renders nothing in that case as a safety net.
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import type { PhotoStatus } from "@/types/database";

interface PhotoFrameProps {
  photoStatus: PhotoStatus;
  dishImageUrl: string | null;
  dishName: string;
  className?: string;
}

export function PhotoFrame({ photoStatus, dishImageUrl, dishName, className }: PhotoFrameProps) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [dishImageUrl]);

  if (photoStatus === "suppressed") return null;

  if (photoStatus === "confirmed" && dishImageUrl && !imageError) {
    return (
      <div className={`relative overflow-hidden rounded-xl ${className ?? ""}`}>
        <Image
          src={dishImageUrl}
          alt={dishName}
          fill
          sizes="(max-width: 768px) 50vw, 33vw"
          className="object-cover"
          unoptimized
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // placeholder — no photo available (or confirmed URL failed to load)
  return (
    <div
      role="img"
      className={`flex flex-col items-center justify-center rounded-xl ${className ?? ""}`}
      aria-label={`No photo for ${dishName}`}
      style={{ background: "var(--color-bg-elevated)" }}
    >
      <PlateIcon />
      <span
        style={{
          fontSize: "var(--text-caption)",
          color: "var(--color-text-tertiary)",
          marginTop: 4,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        No photo available
      </span>
    </div>
  );
}

function PlateIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="opacity-60"
    >
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" />
      <path
        d="M10 16a6 6 0 0 1 12 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}
