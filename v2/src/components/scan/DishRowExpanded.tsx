"use client"

import { useState, useEffect, useRef } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { PhotoFrame } from "@/components/ui/PhotoFrame"
import { MacroBar } from "@/components/ui/MacroBar"
import type { DomainRecipe, DomainIngredient, RecipeStatus } from "@/types/database"

type SavedState = 'idle' | 'saving' | 'checkmark' | 'saved'

function initialSavedState(status: RecipeStatus): SavedState {
  return status === 'kept' ? 'saved' : 'idle'
}

function CheckmarkIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={style}>
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Derives macro provenance from ingredient-level USDA FDC IDs.
// Returns null only when ingredients is null/undefined (still loading).
// An empty array is a resolved state — returns 'ai' (no USDA matches).
function deriveMacroSource(
  ingredients: DomainIngredient[] | null | undefined
): 'ai' | 'usda' | 'partial' | null {
  if (!ingredients) return null
  if (ingredients.length === 0) return 'ai'
  const usdaCount = ingredients.filter((i) => i.usdaFdcId != null).length
  if (usdaCount === 0) return 'ai'
  if (usdaCount === ingredients.length) return 'usda'
  return 'partial'
}

interface DishRowExpandedProps {
  recipe: DomainRecipe
  /**
   * The full recipe WITH ingredients — fetched via useRecipe(recipe.id)
   * when the row is first expanded. Pass null while the fetch is pending.
   */
  expandedRecipe: DomainRecipe | null
  /** Set to true when the useRecipe fetch fails — shows error state instead of perpetual skeleton */
  ingredientsError?: boolean
  /** Macro totals — passed from parent (same values shown in compact state) */
  totalProtein?: number | null
  totalCarbs?: number | null
  totalFat?: number | null
  /**
   * Fibre is not in the DB schema yet — always null at Phase 1.
   * MacroBar must render "—" when null; do NOT hide the fibre cell.
   */
  totalFibre?: number | null
  /** Collapse the row */
  onCollapse: () => void
  /**
   * "Add to My Recipes" tap — parent handles the mutation.
   * Parent must call onError() if the mutation fails so the CTA resets to idle.
   */
  onAddToRecipes: (onError: () => void) => void
  className?: string
}

const MAX_INGREDIENTS_SHOWN = 5

export function DishRowExpanded({
  recipe,
  expandedRecipe,
  ingredientsError,
  totalProtein,
  totalCarbs,
  totalFat,
  totalFibre,
  onCollapse,
  onAddToRecipes,
  className,
}: DishRowExpandedProps) {
  // Dismissed after first collapse tap to prevent rapid double-tap re-firing
  const [dismissed, setDismissed] = useState(false)
  const [portion, setPortion] = useState(1)
  const [savedState, setSavedState] = useState<SavedState>(() => initialSavedState(recipe.status))
  const reducedMotion = useReducedMotion()
  // Timeout IDs for the checkmark → saved animation sequence — cleared on unmount
  const animTimeouts = useRef<{ outer: ReturnType<typeof setTimeout> | null; inner: ReturnType<typeof setTimeout> | null }>({ outer: null, inner: null })

  // Reset dismissed guard when the recipe changes (parent reuse without unmount)
  useEffect(() => { setDismissed(false) }, [recipe.id])

  // Clear pending animation timeouts on unmount (or recipe change) to prevent
  // stale setSavedState calls on an unmounted component
  useEffect(() => {
    return () => {
      if (animTimeouts.current.outer !== null) clearTimeout(animTimeouts.current.outer)
      if (animTimeouts.current.inner !== null) clearTimeout(animTimeouts.current.inner)
    }
  }, [recipe.id])

  // Sync savedState when TanStack Query cache invalidation updates recipe.status.
  // Guard: don't stomp an in-progress animation — the timeout chain handles the
  // final transition. Only apply external status changes from stable states.
  useEffect(() => {
    setSavedState((current) => {
      if (current === 'saving' || current === 'checkmark') return current
      return initialSavedState(recipe.status)
    })
  }, [recipe.status])

  const ingredients = expandedRecipe?.ingredients ?? null

  // Number.isFinite() rejects null, undefined, NaN, and Infinity — matches DishRowCompact guard pattern.
  const scaledCalories = Number.isFinite(recipe.estimatedCalories)
    ? Math.round((recipe.estimatedCalories as number) * portion)
    : null
  const scaledProtein = Number.isFinite(totalProtein) ? (totalProtein as number) * portion : null
  const scaledCarbs   = Number.isFinite(totalCarbs)   ? (totalCarbs   as number) * portion : null
  const scaledFat     = Number.isFinite(totalFat)     ? (totalFat     as number) * portion : null
  const scaledFibre   = Number.isFinite(totalFibre)   ? (totalFibre   as number) * portion : null

  const hasMacroValues = scaledProtein != null || scaledCarbs != null || scaledFat != null
  const macroSource = deriveMacroSource(ingredients)

  return (
    <section
      id={`dish-details-${recipe.id}`}
      aria-label={`${recipe.name} details`}
      className={className ?? ""}
      style={{
        background: "var(--glass-elevated)",
        backdropFilter: "var(--blur-elevated)",
        WebkitBackdropFilter: "var(--blur-elevated)",
        border: "var(--border-glass)",
        borderRadius: 20,
        boxShadow: "var(--shadow-float)",
        overflow: "hidden",
      }}
    >
      {/* Hero photo: 156px height; suppressed dishes skip photo entirely */}
      {recipe.photoStatus !== "suppressed" && (
        <div className="w-full" style={{ height: 156 }}>
          <PhotoFrame
            photoStatus={recipe.photoStatus}
            dishImageUrl={recipe.dishImageUrl}
            dishName={recipe.name}
            className="w-full h-full"
          />
        </div>
      )}

      {/* Content area */}
      <div className="p-4 flex flex-col gap-3">
        {/* Header row: dish name + collapse chevron */}
        <div className="flex items-start justify-between gap-2">
          <h2
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: 19,
              fontWeight: 400,
              color: "var(--color-text-primary)",
              lineHeight: 1.2,
              flex: 1,
            }}
          >
            {recipe.name}
          </h2>
          <button
            type="button"
            onClick={() => {
              setPortion(1)
              setDismissed(true)
              try {
                onCollapse()
              } catch {
                setDismissed(false)
              }
            }}
            disabled={dismissed}
            aria-label="Collapse"
            style={{
              transform: "rotate(180deg)",
              background: "none",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-secondary)",
            }}
          >
            <ChevronDownIcon />
          </button>
        </div>

        {/* Calorie count — omitted when estimatedCalories is null/NaN/Infinity */}
        {/* Wrapped in motion.div to animate in alongside MacroBar when macros first arrive (AC4) */}
        {scaledCalories != null && (
          <motion.div
            data-testid="calorie-motion-wrapper"
            initial={hasMacroValues && !reducedMotion ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p
              style={{
                fontSize: 19,
                fontWeight: 600,
                color: "var(--color-accent)",
                marginTop: -4,
              }}
            >
              {scaledCalories} cal
            </p>
          </motion.div>
        )}

        {/* Portion stepper — 4 fixed options */}
        <div
          role="group"
          aria-label="Serving size"
          style={{ display: "flex", gap: 8 }}
        >
          {([0.5, 1, 1.5, 2] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPortion(value)}
              aria-pressed={portion === value}
              aria-label={`${value} serving${value > 1 ? "s" : ""}`}
              style={{
                flex: 1,
                /* WCAG 2.1 AA: explicit height: 34 overrides the global button min-height: 44px.
                   Replace with minHeight: 44 to meet the 44×44px touch target requirement. */
                minHeight: 44,
                borderRadius: 9999,
                border: portion === value ? "none" : "var(--border-glass)",
                background: portion === value ? "var(--color-accent)" : "var(--glass-base)",
                color: portion === value ? "#ffffff" : "var(--color-text-secondary)",
                fontSize: 13,
                fontWeight: portion === value ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {value}×
            </button>
          ))}
        </div>

        {/* Provenance badge — between portion stepper and MacroBar */}
        {macroSource !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ProvenanceBadge source={macroSource} />
          </div>
        )}

        {/* MacroBar: P / C / F / Fibre — always rendered; null → "—" */}
        {/* Wrapped in motion.div to animate in when macro values first become non-null */}
        <motion.div
          data-testid="macrobar-motion-wrapper"
          key={hasMacroValues ? "macros-present" : "macros-absent"}
          initial={hasMacroValues && !reducedMotion ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <MacroBar
            proteinG={scaledProtein}
            carbsG={scaledCarbs}
            fatG={scaledFat}
            fibreG={scaledFibre}
            isEstimated={macroSource === 'ai'}
          />
        </motion.div>

        {/* Ingredient highlights */}
        {ingredientsError ? (
          /* Fetch failed — show inline error regardless of expandedRecipe state */
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            Couldn&apos;t load ingredients
          </p>
        ) : expandedRecipe === null || ingredients === null ? (
          /* Loading: expandedRecipe pending, or resolved but ingredients not yet populated */
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded"
                style={{
                  height: 14,
                  background: "rgba(180,170,158,0.14)",
                  width: `${72 - i * 12}%`,
                }}
                aria-hidden="true"
              />
            ))}
          </div>
        ) : ingredients.length > 0 ? (
          /* Ingredient list: up to 5 items + "+N more" */
          <div className="flex flex-col gap-1">
            <ul style={{ listStyle: "disc", paddingLeft: 16, margin: 0 }}>
              {ingredients.slice(0, MAX_INGREDIENTS_SHOWN).map((ingredient) => (
                <li
                  key={ingredient.id}
                  style={{ fontSize: 14, color: "var(--color-text-secondary)" }}
                >
                  {ingredient.name}
                </li>
              ))}
            </ul>
            {ingredients.length > MAX_INGREDIENTS_SHOWN && (
              <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                +{ingredients.length - MAX_INGREDIENTS_SHOWN} more
              </p>
            )}
          </div>
        ) : null /* expandedRecipe loaded, ingredients populated, 0 items: omit section */}

        {/* "Add to My Recipes" CTA pill */}
        {/* Single persistent live region — screen readers announce state changes
            without the mount/unmount timing problems of per-element aria-live */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {savedState === 'checkmark' || savedState === 'saved' ? 'Saved to My Recipes' : ''}
        </div>

        {savedState === 'saved' ? (
          <div
            aria-label="Saved to My Recipes"
            style={{
              height: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "var(--glass-base)",
              backdropFilter: "var(--blur-base)",
              WebkitBackdropFilter: "var(--blur-base)",
              borderRadius: 9999,
              border: "var(--border-glass)",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--color-accent)",
            }}
          >
            <CheckmarkIcon />
            Saved to My Recipes
          </div>
        ) : savedState === 'checkmark' ? (
          <div
            aria-label="Saving"
            style={{
              height: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-accent)",
              borderRadius: 9999,
            }}
          >
            <CheckmarkIcon style={{ color: "var(--color-on-accent, #fff)" }} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (savedState !== 'idle') return
              // Clear any stale animation timeouts from a prior interrupted sequence
              if (animTimeouts.current.outer !== null) clearTimeout(animTimeouts.current.outer)
              if (animTimeouts.current.inner !== null) clearTimeout(animTimeouts.current.inner)
              setSavedState('saving')
              onAddToRecipes(() => setSavedState('idle'))
              if (reducedMotion) {
                setSavedState('saved')
              } else {
                animTimeouts.current.outer = setTimeout(() => {
                  animTimeouts.current.outer = null
                  setSavedState('checkmark')
                  animTimeouts.current.inner = setTimeout(() => {
                    animTimeouts.current.inner = null
                    setSavedState('saved')
                  }, 1500)
                }, 0)
              }
            }}
            disabled={savedState === 'saving'}
            aria-label="Add to My Recipes"
            className="w-full font-semibold text-[15px]"
            style={{
              height: 42,
              background: savedState === 'saving' ? "var(--color-accent-light, var(--color-accent))" : "var(--color-accent)",
              color: savedState === 'saving' ? "var(--color-accent)" : "var(--color-on-accent, #fff)",
              borderRadius: 9999,
              border: "none",
              cursor: savedState === 'saving' ? "default" : "pointer",
              transition: "background 0.2s ease, color 0.2s ease",
            }}
          >
            + Add to My Recipes
          </button>
        )}
      </div>
    </section>
  )
}

function ChevronDownIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProvenanceBadge({ source }: { source: 'ai' | 'usda' | 'partial' }) {
  if (source === 'usda') {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: "#2E7D55",
          background: "rgba(46,125,85,0.10)",
          borderRadius: 4,
          padding: "2px 6px",
          textTransform: "uppercase" as const,
        }}
      >
        USDA
      </span>
    )
  }

  if (source === 'partial') {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "var(--color-text-tertiary)",
          background: "rgba(180,170,158,0.12)",
          borderRadius: 4,
          padding: "2px 6px",
        }}
      >
        Partial Est.
      </span>
    )
  }

  // 'ai'
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 500,
        color: "var(--color-text-tertiary)",
        background: "rgba(180,170,158,0.12)",
        borderRadius: 4,
        padding: "2px 6px",
      }}
    >
      Est.
    </span>
  )
}
