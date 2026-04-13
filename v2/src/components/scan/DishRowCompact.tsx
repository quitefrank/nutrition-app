"use client"

import { useReducedMotion } from "framer-motion"
import { PhotoFrame } from "@/components/ui/PhotoFrame"
import type { DomainRecipe } from "@/types/database"

interface DishRowCompactProps {
  recipe: DomainRecipe
  /**
   * Macro totals computed from enrichment pipeline (Story 2.6).
   * Absent when enrichment hasn't completed yet.
   *
   * Expected to be finite, non-negative numbers. The enrich API route is
   * responsible for validating Gemini output before these values reach the UI
   * (see Story 2.8 implementation notes). `NaN`, `Infinity`, and negative
   * values indicate a data contract violation upstream — `Number.isFinite()`
   * guards below prevent them from rendering in the chip row.
   */
  totalProtein?: number | null
  totalCarbs?: number | null
  totalFat?: number | null
  /**
   * Macro provenance signal — defaults to 'ai' when absent.
   * Story 3.6 wires up the actual value when enrichment completes.
   */
  macroSource?: 'ai' | 'usda' | 'partial'
  /** Whether this dish is the currently expanded row */
  isExpanded: boolean
  /** Toggle expand/collapse — used by parent to manage single-open state */
  onToggle: () => void
  className?: string
}

export function DishRowCompact({
  recipe,
  totalProtein,
  totalCarbs,
  totalFat,
  macroSource,
  isExpanded,
  onToggle,
  className,
}: DishRowCompactProps) {
  const reducedMotion = useReducedMotion()

  // AC4: suppressed dishes render null
  if (recipe.photoStatus === "suppressed") return null

  // Show macro chips only when ALL three macro values are finite, non-negative numbers.
  // Number.isFinite() rejects null, undefined, NaN, and Infinity.
  // Negative values are also excluded — they indicate a data contract violation upstream.
  const hasMacros =
    Number.isFinite(totalProtein) && (totalProtein as number) >= 0 &&
    Number.isFinite(totalCarbs) && (totalCarbs as number) >= 0 &&
    Number.isFinite(totalFat) && (totalFat as number) >= 0

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded ? "true" : "false"}
      aria-controls={`dish-details-${recipe.id}`}
      aria-label={
        recipe.estimatedCalories != null
          ? `${recipe.name}, ${recipe.estimatedCalories} calories`
          : recipe.name
      }
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggle()
        }
      }}
      className={`flex items-center gap-3 min-h-[44px] cursor-pointer ${className ?? ""}`}
      style={{
        background: "var(--glass-base)",
        backdropFilter: "var(--blur-base)",
        WebkitBackdropFilter: "var(--blur-base)",
        border: "var(--border-glass)",
        borderRadius: "16px",
        padding: "12px",
        transition: reducedMotion ? "none" : undefined,
      }}
    >
      {/* Photo area — 72×72px */}
      <PhotoFrame
        photoStatus={recipe.photoStatus}
        dishImageUrl={recipe.dishImageUrl}
        dishName={recipe.name}
        className="w-[72px] h-[72px] rounded-xl flex-shrink-0"
      />

      {/* Right column — name, calories, macros */}
      <div className="flex-1 min-w-0">
        {/* Dish name: DM Sans 15px semibold, 2-line clamp */}
        <p
          className="text-[15px] font-semibold leading-snug"
          style={{
            color: "var(--color-text-primary)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {recipe.name}
        </p>

        {/* Calorie count: 14px semibold, terracotta */}
        {recipe.estimatedCalories != null && (
          <p
            className="text-[14px] font-semibold mt-0.5"
            style={{ color: "var(--color-accent)" }}
          >
            {recipe.estimatedCalories} cal
          </p>
        )}

        {/* Macro chips row — only when all three values are present */}
        {hasMacros && (
          <div className="flex items-center mt-1 flex-wrap gap-x-1 gap-y-0">
            <MacroChip label="P" value={Math.round(totalProtein!)} />
            <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
              ·
            </span>
            <MacroChip label="C" value={Math.round(totalCarbs!)} />
            <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
              ·
            </span>
            <MacroChip label="F" value={Math.round(totalFat!)} />
            {/* Provenance badge — conditional on macroSource */}
            {macroSource === 'usda' ? (
              <span className="text-[10px] ml-1 font-semibold" style={{ color: "#2E7D55" }}>
                USDA
              </span>
            ) : macroSource === 'partial' ? (
              <span
                className="text-[10px] ml-1"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Partial Est.
              </span>
            ) : (
              <span
                className="text-[10px] ml-1"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Est.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface MacroChipProps {
  label: string
  value: number
}

function MacroChip({ label, value }: MacroChipProps) {
  return (
    <span
      className="text-[12px]"
      style={{ color: "var(--color-text-secondary)" }}
    >
      {label} {value}g
    </span>
  )
}
