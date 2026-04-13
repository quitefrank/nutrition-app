"use client"

import { useRouter } from "next/navigation"
import { useKeptRecipes } from "@/hooks/useRecipes"
import { RecipeGridCard } from "@/components/ui/RecipeGridCard"

// ─── RecipesScreen ────────────────────────────────────────────────────────────

export function RecipesScreen() {
  const router = useRouter()
  const { data: recipes, isLoading, isError, refetch } = useKeptRecipes()

  return (
    <div
      className="min-h-full flex flex-col"
      style={{ paddingBottom: "calc(var(--tab-bar-height, 62px) + var(--space-safe-bottom, 0px) + 24px)" }}
    >
      {/* Header */}
      <div
        className="px-4 flex items-center"
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
                <div key={recipe.id} role="listitem">
                  <RecipeGridCard
                    recipe={recipe}
                    onPress={() => router.push(`/recipe/${recipe.id}`)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
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
