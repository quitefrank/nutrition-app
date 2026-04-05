'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useGroceryItems, useGroceryRecipeGroups, useBulkRemoveRecipe } from '@/hooks/use-grocery'
import { ErrorState } from '@/components/ui/error-state'
import type { GroceryRecipeGroup, GroceryListItem } from '@/types/api'

// Merge flat GroceryListItem[] with recipe summaries to produce GroceryRecipeGroup[].
// Items grouped by their stored recipe_id — merged items appear under their ORIGINAL recipe
// (the recipe_id they were first inserted with), not the recipe that triggered the merge.
// This is intentional: story 4.1 preserves the original recipe_id on merge.
function buildGroups(
  items: GroceryListItem[],
  summaries: { recipeId: string | null; recipeName: string; dishImageUrl: string | null; restaurantName: string | null; itemCount: number }[]
): GroceryRecipeGroup[] {
  const itemsByRecipe = new Map<string | null, GroceryListItem[]>()
  for (const item of items) {
    const key = item.recipeId ?? null
    const existing = itemsByRecipe.get(key) ?? []
    existing.push(item)
    itemsByRecipe.set(key, existing)
  }

  const mappedRecipeIds = new Set(summaries.map(s => s.recipeId))

  const groups: GroceryRecipeGroup[] = summaries
    .filter(s => (itemsByRecipe.get(s.recipeId) ?? []).length > 0)
    .map(s => ({
      recipeId: s.recipeId,
      recipeName: s.recipeName,
      dishImageUrl: s.dishImageUrl,
      restaurantName: s.restaurantName,
      items: itemsByRecipe.get(s.recipeId) ?? [],
    }))

  // Collect orphan items: recipeId present in items cache but absent from summaries
  // (can occur when summaries cache is stale after a concurrent mutation).
  // Rescue them into the "Other items" group rather than silently dropping them.
  const orphanItems: GroceryListItem[] = []
  for (const [key, keyItems] of itemsByRecipe) {
    if (!mappedRecipeIds.has(key)) {
      orphanItems.push(...keyItems)
    }
  }

  if (orphanItems.length > 0) {
    const otherIdx = groups.findIndex(g => g.recipeId === null)
    if (otherIdx !== -1) {
      groups[otherIdx] = { ...groups[otherIdx], items: [...groups[otherIdx].items, ...orphanItems] }
    } else {
      groups.push({ recipeId: null, recipeName: 'Other items', dishImageUrl: null, restaurantName: null, items: orphanItems })
    }
  }

  return groups
}

// ─── Recipe Group Card ────────────────────────────────────────────────────────

function RecipeGroupCard({ group }: { group: GroceryRecipeGroup }) {
  const [expanded, setExpanded] = useState(false)
  const { mutate: bulkRemove, isPending } = useBulkRemoveRecipe()

  const visibleItems = expanded ? group.items : group.items.slice(0, 3)
  const hiddenCount = group.items.length - 3
  const isOtherGroup = group.recipeId === null

  function handleRemoveAll() {
    if (group.recipeId === null) return   // suppressed for null group — no UUID to pass
    bulkRemove(group.recipeId)
  }

  return (
    <div
      role="region"
      aria-label={`Recipe group: ${group.recipeName}`}
      style={{
        background: 'var(--bg-card, rgba(255,255,255,0.06))',
        borderRadius: 'var(--radius-md, 12px)',
        overflow: 'hidden',
        marginBottom: '12px',
      }}
    >
      {/* Card header: thumbnail + name + restaurant + item count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
        }}
      >
        {/* Thumbnail — shown for named recipes; hidden for "Other items" */}
        {!isOtherGroup && (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--radius-md, 12px)',
              overflow: 'hidden',
              flexShrink: 0,
              background: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {group.dishImageUrl ? (
              <Image
                src={group.dishImageUrl}
                alt={group.recipeName}
                width={48}
                height={48}
                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
              />
            ) : (
              /* Fallback placeholder icon */
              <span style={{ fontSize: '20px' }} aria-hidden>🍽️</span>
            )}
          </div>
        )}

        {/* Recipe name + restaurant */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {group.recipeName}
          </div>
          {group.restaurantName && (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: '2px',
              }}
            >
              {group.restaurantName}
            </div>
          )}
        </div>

        {/* Item count badge */}
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-full, 9999px)',
            padding: '2px 8px',
            flexShrink: 0,
          }}
        >
          {group.items.length} item{group.items.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

      {/* Ingredient rows */}
      <ul aria-label={`Ingredients in ${group.recipeName}`} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {visibleItems.map(item => (
          <li
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 56,
              padding: '0 16px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
              {item.ingredientName}
            </span>
            {(item.quantity || item.unit) && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {[item.quantity, item.unit].filter(Boolean).join(' ')}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Disclosure toggle — expand when >3 items, collapse when already expanded */}
      {hiddenCount > 0 && (
        expanded ? (
          <button
            onClick={() => setExpanded(false)}
            aria-label="Show fewer ingredients"
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              color: 'var(--text-muted)',
              fontSize: '0.875rem',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            Show less ▴
          </button>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            aria-label={`Show ${hiddenCount} more ingredients`}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              color: 'var(--text-muted)',
              fontSize: '0.875rem',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            + {hiddenCount} more ▾
          </button>
        )
      )}

      {/* Divider above footer button */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

      {/* "Remove all X items" footer — suppressed for null group (no UUID available) */}
      {!isOtherGroup && (
        <div style={{ padding: '10px 16px' }}>
          <button
            onClick={handleRemoveAll}
            disabled={isPending}
            aria-label={`Remove all ${group.items.length} items from ${group.recipeName}`}
            style={{
              width: '100%',
              padding: '8px 0',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 'var(--radius-md, 12px)',
              color: 'rgb(239,68,68)',
              fontSize: '0.75rem',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            Remove all {group.items.length} items
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Skeleton card (loading state) ───────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      aria-hidden
      className="animate-pulse"
      style={{
        background: 'var(--bg-card, rgba(255,255,255,0.06))',
        borderRadius: 'var(--radius-md, 12px)',
        overflow: 'hidden',
        marginBottom: '12px',
        height: 160,
        opacity: 0.5,
      }}
    />
  )
}

// ─── GroceryRecipeView ────────────────────────────────────────────────────────

export function GroceryRecipeView() {
  const { data: items, isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useGroceryItems()
  const {
    data: summaries,
    isLoading: summariesLoading,
    isError: summariesError,
    refetch: refetchSummaries,
  } = useGroceryRecipeGroups()

  function handleRetry() {
    void refetchItems()
    void refetchSummaries()
  }

  const isLoading = itemsLoading || summariesLoading
  const isError = itemsError || summariesError

  if (isLoading) {
    return (
      <div aria-label="Loading recipe groups" style={{ padding: '16px' }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: '32px 16px' }}>
        <ErrorState
          message="Could not load recipes. Please try again."
          onRetry={handleRetry}
        />
      </div>
    )
  }

  const groups = buildGroups(items ?? [], summaries ?? [])

  if (groups.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 text-center px-6"
        style={{ minHeight: 'calc(100dvh - 80px)' }}
      >
        <p style={{ fontSize: 'var(--text-2xl)', color: 'var(--text-primary)', fontWeight: 600 }}>
          No recipes added yet
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Add a recipe to your grocery list to get started.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px' }} aria-label="Recipe groups">
      {groups.map(group => (
        <RecipeGroupCard
          key={group.recipeId ?? '__other__'}
          group={group}
        />
      ))}
    </div>
  )
}
