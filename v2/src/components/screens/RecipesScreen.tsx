"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useKeptRecipes, useUpdateRecipe } from "@/hooks/useRecipes"
import { RecipeGridCard } from "@/components/ui/RecipeGridCard"
import { BottomSheet } from "@/components/ui/BottomSheet"

// ─── RecipesScreen ────────────────────────────────────────────────────────────

export function RecipesScreen() {
  const router = useRouter()
  const { data: recipes, isLoading, isError, refetch } = useKeptRecipes()
  const [isEditMode, setIsEditMode] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)
  // Capture name at selection time so the sheet label is stable during mutation
  const [removeCandidateName, setRemoveCandidateName] = useState("")
  const updateRecipe = useUpdateRecipe()

  return (
    <div
      className="min-h-full flex flex-col"
      style={{ paddingBottom: "calc(var(--tab-bar-height, 62px) + var(--space-safe-bottom, 0px) + 24px)" }}
    >
      {/* Header */}
      <div
        className="px-4 flex items-center justify-between"
        style={{ paddingTop: "calc(var(--space-safe-top, 0px) + 16px)", paddingBottom: 12 }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-display), Georgia, serif",
          }}
        >
          My Recipes
        </h1>
        {/* Edit button hidden during loading to avoid showing stale edit state (D1) */}
        {!isLoading && recipes && recipes.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setIsEditMode((prev) => !prev)
              setRemoveCandidate(null)
            }}
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--color-accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              minHeight: 44,
              minWidth: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isEditMode ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4">
        {isLoading ? (
          <RecipesGridSkeleton />
        ) : !recipes || recipes.length === 0 ? (
          isError ? (
            <RecipesErrorState onRetry={refetch} />
          ) : (
            <RecipesEmptyState />
          )
        ) : (
          <>
            {isError && <RecipesErrorBanner onRetry={refetch} />}
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "1fr 1fr" }}
              role="list"
              aria-label="My Recipes"
            >
              {recipes.map((recipe) => (
                <div key={recipe.id} role="listitem" style={{ position: "relative" }}>
                  <RecipeGridCard
                    recipe={recipe}
                    onPress={isEditMode ? () => {} : () => router.push(`/recipe/${recipe.id}`)}
                  />
                  {isEditMode && (
                    // 44×44 transparent hit area; inner span carries the visual 28×28 circle
                    <button
                      type="button"
                      aria-label={`Remove ${recipe.name} from My Recipes`}
                      onClick={() => {
                        setRemoveCandidate(recipe.id)
                        setRemoveCandidateName(recipe.name)
                      }}
                      style={{
                        position: "absolute",
                        top: -14,
                        left: -14,
                        width: 44,
                        height: 44,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        zIndex: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "rgba(251,234,234,0.97)",
                          border: "1.5px solid rgba(185,64,64,0.22)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          // Preserve icon colours in forced-colours / high-contrast mode
                          forcedColorAdjust: "none",
                          color: "#B94040",
                        } as React.CSSProperties}
                      >
                        <MinusIcon />
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Removal confirmation sheet */}
      {/* Block backdrop/Escape close while mutation is in-flight to avoid orphaned mutations */}
      <BottomSheet
        isOpen={removeCandidate !== null}
        onClose={updateRecipe.isPending ? () => {} : () => setRemoveCandidate(null)}
        label="Remove recipe confirmation"
      >
        {/* key resets RemoveConfirmationPanel's internal confirmed state on each new candidate */}
        <RemoveConfirmationPanel
          key={removeCandidate ?? "none"}
          recipeName={removeCandidateName}
          isPending={updateRecipe.isPending}
          onConfirm={() => {
            if (!removeCandidate) return
            updateRecipe.mutate(
              { id: removeCandidate, updates: { status: "auto_captured" } },
              {
                onSuccess: () => {
                  setRemoveCandidate(null)
                  // Edit mode stays active so the user can remove additional recipes
                },
                onError: () => {
                  setRemoveCandidate(null)
                },
              }
            )
          }}
          onCancel={() => setRemoveCandidate(null)}
        />
      </BottomSheet>
    </div>
  )
}

// ─── MinusIcon ────────────────────────────────────────────────────────────────

function MinusIcon() {
  return (
    // stroke="currentColor" inherits #B94040 from the parent span in normal mode;
    // in forced-colours mode forcedColorAdjust:"none" on the span preserves it
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="rgba(185,64,64,0.10)" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ─── RemoveConfirmationPanel ──────────────────────────────────────────────────

interface RemoveConfirmationPanelProps {
  recipeName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

function RemoveConfirmationPanel({ recipeName, isPending, onConfirm, onCancel }: RemoveConfirmationPanelProps) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    // px-4 removed — BottomSheet already provides px-5 wrapper
    <div className="py-6 flex flex-col gap-4">
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>
          Remove from My Recipes?
        </h2>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          <strong>{recipeName}</strong> will be removed from My Recipes. You can always add it back from the restaurant.
        </p>
      </div>

      {!confirmed ? (
        /* Step 3: first confirmation — disabled during pending to prevent concurrent mutations */
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirmed(true)}
          style={{
            height: 50,
            borderRadius: 9999,
            background: "rgba(251,234,234,0.95)",
            color: "#B94040",
            fontSize: 15,
            fontWeight: 600,
            border: "none",
            cursor: isPending ? "default" : "pointer",
            width: "100%",
          }}
        >
          Remove from My Recipes
        </button>
      ) : (
        /* Step 4: destructive confirmation */
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          style={{
            height: 50,
            borderRadius: 9999,
            background: isPending ? "rgba(180,170,158,0.12)" : "#B94040",
            color: isPending ? "var(--color-text-tertiary)" : "#fff",
            fontSize: 15,
            fontWeight: 700,
            border: "none",
            cursor: isPending ? "default" : "pointer",
            width: "100%",
          }}
        >
          {isPending ? "Removing\u2026" : "Yes, remove it"}
        </button>
      )}

      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        style={{
          height: 44,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          color: "var(--color-text-tertiary)",
        }}
      >
        Cancel
      </button>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RecipesEmptyState() {
  return (
    <div
      role="region"
      aria-label="My Recipes empty state"
      style={{
        marginTop: 16,
        borderRadius: 18,
        border: "1.5px dashed rgba(180,170,158,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 160,
        padding: "24px 16px",
      }}
    >
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-disabled)",
          textAlign: "center",
          maxWidth: 200,
          lineHeight: 1.5,
        }}
      >
        Dishes you&apos;ve kept from your restaurant visits will appear here
      </p>
    </div>
  )
}

function RecipesGridSkeleton() {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "1fr 1fr" }}
      aria-busy="true"
      aria-label="Loading recipes"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={`skeleton-${i}`}
          className="animate-pulse rounded-2xl overflow-hidden"
          style={{ background: "rgba(180,170,158,0.10)", height: 140 }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

function RecipesErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3"
      style={{ minHeight: 120 }}
    >
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
        Couldn&apos;t load your recipes
      </p>
      <button
        onClick={onRetry}
        style={{
          fontSize: 13,
          color: "var(--color-text-tertiary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
        }}
      >
        Try again
      </button>
    </div>
  )
}

function RecipesErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between"
      style={{
        marginBottom: 12,
        padding: "8px 12px",
        borderRadius: 10,
        background: "rgba(196,98,45,0.08)",
        border: "1px solid rgba(196,98,45,0.15)",
      }}
    >
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
        Couldn&apos;t refresh. Showing last saved recipes.
      </p>
      <button
        onClick={onRetry}
        style={{
          fontSize: 12,
          color: "var(--color-accent)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 0 0 8px",
          flexShrink: 0,
        }}
      >
        Retry
      </button>
    </div>
  )
}
