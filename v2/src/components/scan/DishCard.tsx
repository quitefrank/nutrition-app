"use client"

import { Fragment, useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { PhotoFrame } from "@/components/ui/PhotoFrame"
import { MacroDisplay } from "@/components/ui/MacroDisplay"
import { SPRING_CARD_EXPAND } from "@/lib/springs"
import type { DomainRecipe, DomainIngredient, RecipeStatus } from "@/types/database"

// ─── Types ───────────────────────────────────────────────────

type SavedState = "idle" | "saving" | "checkmark" | "saved"

function initialSavedState(status: RecipeStatus): SavedState {
  return status === "kept" ? "saved" : "idle"
}

interface DishCardProps {
  recipe: DomainRecipe
  /**
   * Full recipe with ingredients — passed from parent's useRecipe(expandedDishId) hook.
   * Null while the fetch is pending.
   */
  expandedRecipe: DomainRecipe | null
  /** True when the useRecipe fetch fails — shows error state instead of perpetual skeleton */
  ingredientsError?: boolean
  totalProtein?: number | null
  totalCarbs?: number | null
  totalFat?: number | null
  totalFibre?: number | null
  macroSource?: "ai" | "usda" | "partial"
  /** Whether this card is currently in the expanded state (controlled by parent) */
  isExpanded: boolean
  /** Toggle expand/collapse — parent manages single-open state */
  onToggle: () => void
  /**
   * "Add to My Recipes" tap — parent handles the mutation.
   * Parent must call onError() if the mutation fails so the CTA resets to idle.
   */
  onAddToRecipes: (onError: () => void) => void
  className?: string
}

const MAX_INGREDIENTS_SHOWN = 5

// ─── Helpers ─────────────────────────────────────────────────

function deriveMacroSource(
  ingredients: DomainIngredient[] | null | undefined
): "ai" | "usda" | "partial" | null {
  if (!ingredients) return null
  if (ingredients.length === 0) return "ai"
  const usdaCount = ingredients.filter((i) => i.usdaFdcId != null).length
  if (usdaCount === 0) return "ai"
  if (usdaCount === ingredients.length) return "usda"
  return "partial"
}

// ─── DishCard ────────────────────────────────────────────────
//
// Single persistent DOM tree — no AnimatePresence key-swapping for the main layout.
// flexDirection "row" → "column" drives the compact ↔ expanded shape change.
// Framer Motion runs one unified FLIP calculation over the entire card tree,
// eliminating the multi-step jumps caused by independent layoutId transitions.

export function DishCard({
  recipe,
  expandedRecipe,
  ingredientsError,
  totalProtein,
  totalCarbs,
  totalFat,
  totalFibre,
  macroSource,
  isExpanded,
  onToggle,
  onAddToRecipes,
  className,
}: DishCardProps) {
  const reducedMotion = useReducedMotion()
  const [dismissed, setDismissed] = useState(false)
  const [savedState, setSavedState] = useState<SavedState>(() =>
    initialSavedState(recipe.status)
  )
  const animTimeouts = useRef<{
    outer: ReturnType<typeof setTimeout> | null
    inner: ReturnType<typeof setTimeout> | null
  }>({ outer: null, inner: null })

  const springTransition = reducedMotion ? { duration: 0 } : SPRING_CARD_EXPAND

  // Reset dismissed guard after collapse animation completes
  useEffect(() => {
    if (!isExpanded) {
      const t = setTimeout(() => setDismissed(false), 300)
      return () => clearTimeout(t)
    }
  }, [isExpanded])

  // Sync savedState when TanStack Query cache invalidation updates recipe.status.
  // Guard: don't stomp an in-progress animation.
  useEffect(() => {
    setSavedState((current) => {
      if (current === "saving" || current === "checkmark") return current
      return initialSavedState(recipe.status)
    })
  }, [recipe.status])

  // Clear pending animation timeouts on unmount or recipe change
  useEffect(() => {
    return () => {
      if (animTimeouts.current.outer !== null) clearTimeout(animTimeouts.current.outer)
      if (animTimeouts.current.inner !== null) clearTimeout(animTimeouts.current.inner)
    }
  }, [recipe.id])

  // Suppressed dishes render nothing
  if (recipe.photoStatus === "suppressed") return null

  const ingredients = expandedRecipe?.ingredients ?? null
  const derivedMacroSource = deriveMacroSource(ingredients)

  const scaledCalories = Number.isFinite(recipe.estimatedCalories)
    ? Math.round(recipe.estimatedCalories as number)
    : null
  const scaledProtein = Number.isFinite(totalProtein) ? (totalProtein as number) : null
  const scaledCarbs   = Number.isFinite(totalCarbs)   ? (totalCarbs   as number) : null
  const scaledFat     = Number.isFinite(totalFat)     ? (totalFat     as number) : null
  const scaledFibre   = Number.isFinite(totalFibre)   ? (totalFibre   as number) : null

  const hasMacroValues = scaledProtein != null || scaledCarbs != null || scaledFat != null

  const handleCollapse = useCallback(() => {
    if (dismissed) return
    setDismissed(true)
    onToggle()
  }, [dismissed, onToggle])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onToggle()
      }
    },
    [onToggle]
  )

  const handleSave = useCallback(() => {
    if (savedState !== "idle") return
    if (animTimeouts.current.outer !== null) clearTimeout(animTimeouts.current.outer)
    if (animTimeouts.current.inner !== null) clearTimeout(animTimeouts.current.inner)
    setSavedState("saving")
    onAddToRecipes(() => setSavedState("idle"))
    if (reducedMotion) {
      setSavedState("saved")
    } else {
      animTimeouts.current.outer = setTimeout(() => {
        animTimeouts.current.outer = null
        setSavedState("checkmark")
        animTimeouts.current.inner = setTimeout(() => {
          animTimeouts.current.inner = null
          setSavedState("saved")
        }, 1500)
      }, 0)
    }
  }, [savedState, onAddToRecipes, reducedMotion])

  return (
    <motion.div
      layout
      className={className ?? ""}
      // Card acts as the interactive button only in compact mode
      role={!isExpanded ? "button" : undefined}
      tabIndex={!isExpanded ? 0 : undefined}
      aria-expanded={!isExpanded ? false : undefined}
      aria-controls={`dish-details-${recipe.id}`}
      aria-label={
        !isExpanded
          ? scaledCalories != null
            ? `${recipe.name}, ${scaledCalories} calories`
            : recipe.name
          : undefined
      }
      onClick={!isExpanded ? onToggle : undefined}
      onKeyDown={!isExpanded ? handleKeyDown : undefined}
      style={{
        background: isExpanded ? "var(--glass-elevated)" : "var(--glass-base)",
        backdropFilter: isExpanded ? "var(--blur-elevated)" : "var(--blur-base)",
        WebkitBackdropFilter: isExpanded ? "var(--blur-elevated)" : "var(--blur-base)",
        border: "var(--border-glass)",
        borderRadius: isExpanded ? 20 : 16,
        boxShadow: isExpanded ? "var(--shadow-float)" : undefined,
        overflow: "hidden",
        cursor: !isExpanded ? "pointer" : "default",
      }}
      transition={springTransition}
    >
      {/* Stable id for aria-controls reference */}
      <div id={`dish-details-${recipe.id}`}>

        {/* ── Flex wrapper: row (compact) → column (expanded) ────────────
            FLIP handles the position change for all direct children      */}
        <motion.div
          layout
          style={{
            display: "flex",
            flexDirection: isExpanded ? "column" : "row",
            alignItems: isExpanded ? "stretch" : "center",
            padding: isExpanded ? 0 : 12,
            gap: isExpanded ? 0 : 12,
          }}
          transition={springTransition}
        >

          {/* ── Photo — always mounted; FLIP-animates from 72×72 to full-width hero ── */}
          <motion.div
            layout
            onClick={isExpanded ? handleCollapse : undefined}
            style={{
              width: isExpanded ? "100%" : 72,
              height: isExpanded ? 156 : 72,
              borderRadius: isExpanded ? 0 : 12,
              flexShrink: 0,
              overflow: "hidden",
              cursor: isExpanded ? (dismissed ? "default" : "pointer") : undefined,
            }}
            transition={springTransition}
          >
            <PhotoFrame
              photoStatus={recipe.photoStatus}
              dishImageUrl={recipe.dishImageUrl}
              dishName={recipe.name}
              className="w-full h-full"
            />
          </motion.div>

          {/* ── Text column — always mounted; moves from beside photo to below it ── */}
          <motion.div
            layout
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: isExpanded ? 8 : 4,
              padding: isExpanded ? 16 : 0,
              minWidth: 0,
            }}
            transition={springTransition}
          >

            {/* Title row: title + collapse chevron
                Entire row is tappable to collapse in expanded mode */}
            <motion.div
              layout
              onClick={isExpanded ? handleCollapse : undefined}
              style={{
                display: "flex",
                alignItems: isExpanded ? "flex-start" : "center",
                justifyContent: "space-between",
                gap: 8,
                cursor: isExpanded ? (dismissed ? "default" : "pointer") : undefined,
              }}
              transition={springTransition}
            >
              {/* Title — position FLIP; font/size switch instantly */}
              <motion.p
                layout="position"
                transition={springTransition}
                style={{
                  fontFamily: isExpanded
                    ? "var(--font-display), Georgia, serif"
                    : "var(--font-sans)",
                  fontSize: isExpanded ? 19 : 15,
                  fontWeight: isExpanded ? 400 : 600,
                  lineHeight: isExpanded ? 1.2 : 1.3,
                  color: "var(--color-text-primary)",
                  flex: 1,
                  ...(isExpanded
                    ? {}
                    : {
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }),
                }}
              >
                {recipe.name}
              </motion.p>

              {/* Collapse chevron — expanded mode only.
                  stopPropagation prevents double-firing with the row handler above. */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.button
                    key="chevron"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleCollapse() }}
                    disabled={dismissed}
                    aria-label="Collapse"
                    style={{
                      transform: "rotate(180deg)",
                      background: "none",
                      border: "none",
                      cursor: dismissed ? "default" : "pointer",
                      flexShrink: 0,
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <ChevronDownIcon />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Calories — fontSize 14 (compact) ↔ 19 (expanded) */}
            {scaledCalories != null ? (
              <motion.p
                layout
                transition={springTransition}
                style={{
                  fontSize: isExpanded ? 19 : 14,
                  fontWeight: 600,
                  lineHeight: 1,
                  color: "var(--color-accent)",
                }}
              >
                {scaledCalories} cal
              </motion.p>
            ) : !isExpanded && (
              /* Phase-1 skeleton: Gemini scan still running */
              <div
                className="animate-pulse rounded-full"
                aria-hidden="true"
                style={{ height: 12, width: 52, background: "rgba(180,170,158,0.18)" }}
              />
            )}

            {/* MacroDisplay — always mounted; isExpanded drives chip ↔ bar morph */}
            {hasMacroValues ? (
              <MacroDisplay
                proteinG={scaledProtein}
                carbsG={scaledCarbs}
                fatG={scaledFat}
                fibreG={isExpanded ? scaledFibre : undefined}
                isEstimated={derivedMacroSource === "ai"}
                isExpanded={isExpanded}
              />
            ) : scaledCalories != null && !isExpanded && (
              /* Phase-2 skeleton: calories arrived, USDA pipeline still running */
              <div className="flex items-center" aria-hidden="true">
                {([36, 32, 32] as const).map((w, i) => (
                  <Fragment key={i}>
                    <div
                      className="animate-pulse rounded-full"
                      style={{ height: 20, width: w, background: "rgba(180,170,158,0.14)" }}
                    />
                    {i < 2 && (
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 2px" }}>·</span>
                    )}
                  </Fragment>
                ))}
              </div>
            )}

            {/* ── Expanded-only content ─────────────────────────────────── */}

            {/* Provenance badge — above MacroDisplay in expanded order,
                but rendered here because it requires derivedMacroSource
                from loaded ingredients, which is only non-null when expanded */}
            <AnimatePresence initial={false}>
              {isExpanded && derivedMacroSource !== null && (
                <motion.div
                  key="provenance"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.08, duration: 0.18 } }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                >
                  <ProvenanceBadge source={derivedMacroSource} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ingredients + CTA block */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key="expanded-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.08, duration: 0.18 } }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {/* Ingredient highlights */}
                  {ingredientsError ? (
                    <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                      Couldn&apos;t load ingredients
                    </p>
                  ) : expandedRecipe === null || ingredients === null ? (
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
                  ) : null}

                  {/* "Add to My Recipes" CTA */}
                  <div aria-live="polite" aria-atomic="true" className="sr-only">
                    {savedState === "checkmark" || savedState === "saved"
                      ? "Saved to My Recipes"
                      : ""}
                  </div>

                  {savedState === "saved" ? (
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
                  ) : savedState === "checkmark" ? (
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
                      onClick={handleSave}
                      disabled={savedState === "saving"}
                      aria-label="Add to My Recipes"
                      className="w-full font-semibold text-[15px]"
                      style={{
                        height: 42,
                        background:
                          savedState === "saving"
                            ? "var(--color-accent-light, var(--color-accent))"
                            : "var(--color-accent)",
                        color:
                          savedState === "saving"
                            ? "var(--color-accent)"
                            : "var(--color-on-accent, #fff)",
                        borderRadius: 9999,
                        border: "none",
                        cursor: savedState === "saving" ? "default" : "pointer",
                        transition: "background 0.2s ease, color 0.2s ease",
                      }}
                    >
                      + Add to My Recipes
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── Icons ────────────────────────────────────────────────────

function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function CheckmarkIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={style}>
      <path
        d="M5 12l5 5L20 7"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProvenanceBadge({ source }: { source: "ai" | "usda" | "partial" }) {
  if (source === "usda") {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: "#2E7D55",
          background: "rgba(46,125,85,0.10)",
          borderRadius: 4,
          padding: "2px 6px",
          textTransform: "uppercase",
        }}
      >
        USDA
      </span>
    )
  }

  if (source === "partial") {
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
