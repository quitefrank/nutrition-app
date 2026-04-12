/**
 * DishCard — single dish card in the restaurant or home collection views.
 *
 * Returns null when photoStatus is 'suppressed' (Gemini confidence < 0.3 —
 * the dish was not reliably identified and should not appear in the layout).
 *
 * For 'confirmed' and 'placeholder' states, renders:
 *   - PhotoFrame (shows real photo or styled placeholder)
 *   - Dish name
 *   - Calorie estimate (when present)
 *   - Optional delete / action button
 */

import type { DomainRecipe } from "@/types/database";
import { PhotoFrame } from "./PhotoFrame";

interface DishCardProps {
  recipe: DomainRecipe;
  onPress?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function DishCard({ recipe, onPress, onDelete, className }: DishCardProps) {
  if (recipe.photoStatus === "suppressed") return null;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-sm cursor-pointer ${className ?? ""}`}
      onClick={onPress}
      role={onPress ? "button" : undefined}
      tabIndex={onPress ? 0 : undefined}
      onKeyDown={onPress ? (e) => { if (e.key === "Enter" || e.key === " ") onPress() } : undefined}
    >
      <PhotoFrame
        photoStatus={recipe.photoStatus}
        dishImageUrl={recipe.dishImageUrl}
        dishName={recipe.name}
        className="aspect-[4/3] w-full"
      />

      <div className="p-3">
        <p className="text-sm font-semibold text-white leading-tight line-clamp-2">
          {recipe.name}
        </p>
        {recipe.estimatedCalories != null && (
          <p className="mt-0.5 text-xs text-white/60">
            {recipe.estimatedCalories} cal
          </p>
        )}
      </div>

      {onDelete && (
        <button
          type="button"
          aria-label={`Remove ${recipe.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
