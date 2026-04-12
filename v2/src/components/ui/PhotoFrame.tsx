/**
 * PhotoFrame — three-state photo component for dish cards.
 *
 * States:
 *   confirmed   — renders <img> with the resolved photo URL
 *   placeholder — renders a styled div with a plate icon (enrichment in progress)
 *   suppressed  — returns null (card should not be rendered at all; handled by DishCard)
 *
 * The parent is responsible for not rendering PhotoFrame when photoStatus is
 * 'suppressed'. PhotoFrame itself renders nothing in that case as a safety net.
 */

import Image from "next/image";
import type { PhotoStatus } from "@/types/database";

interface PhotoFrameProps {
  photoStatus: PhotoStatus;
  dishImageUrl: string | null;
  dishName: string;
  className?: string;
}

export function PhotoFrame({ photoStatus, dishImageUrl, dishName, className }: PhotoFrameProps) {
  if (photoStatus === "suppressed") return null;

  if (photoStatus === "confirmed" && dishImageUrl) {
    return (
      <div className={`relative overflow-hidden rounded-xl ${className ?? ""}`}>
        <Image
          src={dishImageUrl}
          alt={dishName}
          fill
          sizes="(max-width: 768px) 50vw, 33vw"
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }

  // placeholder — enrichment not yet complete
  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-white/10 ${className ?? ""}`}
      aria-label={`Photo loading for ${dishName}`}
    >
      <PlateIcon />
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
      className="opacity-30"
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
