# Story 4.3: Grocery List Recipe View & Bulk Remove

**Status:** ready-for-dev
**Story ID:** 4.3
**Epic:** 4 — Grocery List

---

## Story

As a user who added multiple recipes to my grocery list,
I want to see my grocery list grouped by recipe,
So that I can remove all items from a recipe I no longer want to cook.

---

## Acceptance Criteria

**AC-1: Toggle switches to recipe-grouped view**
**Given** the grocery list has items
**When** the user taps the "By Recipe" pill in the toggle
**Then** the view switches to recipe-grouped cards with a 200ms crossfade; the same `['grocery-items']` cache is used (no re-fetch on toggle)

**AC-2: Recipe group card content**
**Given** the recipe view is active
**When** rendered
**Then** each recipe group shows: thumbnail image (from `recipes.dish_image_url`) + recipe name + restaurant name (if any) + item count; groups with >3 ingredients show first 3 rows + "+ N more" disclosure that expands on tap

**AC-3: Bulk remove by recipe**
**Given** the recipe view is active
**When** the user taps "Remove all X items" for a recipe group
**Then** all grocery items for that `recipe_id` are deleted via `DELETE /api/grocery/bulk?recipeId=<uuid>`; the group disappears from the list; `['grocery-items']` cache is invalidated

**AC-4: Merged items appear under original recipe**
**Given** a grocery item was merged from a second recipe (story 4.1 merge logic)
**When** recipe view renders
**Then** the item appears under its ORIGINAL `recipe_id` group (the one stored on the row); items with `recipe_id = null` are grouped under "Other items"

**AC-5: Toggle crossfade transition**
**Given** the toggle state
**When** the user switches between "Ingredients" and "By Recipe"
**Then** the transition is a 200ms ease crossfade (not a slide); tab state is local UI state (no URL param needed)

---

## Tasks / Subtasks

### Task 1: Verify bulk delete `?recipeId` support in `src/app/api/grocery/bulk/route.ts`
- [ ] Read existing `bulk/route.ts` to confirm `?recipeId=<uuid>` DELETE path exists from story 4.2
- [ ] If missing, add the `recipeId` branch (UUID-validated, Supabase delete where `recipe_id = recipeId`)
- [ ] If present, no changes needed to `bulk/route.ts`

### Task 2: Add new API route `src/app/api/grocery/recipes/route.ts` (Option C)
- [ ] Create GET handler that queries `grocery_items` joined to `recipes` and `restaurants`
- [ ] Return `GroceryRecipeSummary[]` (recipeId, recipeName, dishImageUrl, restaurantName, itemCount)
- [ ] Include a "null" group entry if any items have `recipe_id = null`
- [ ] Validate no untrusted input (this is a read-only route with no query params)
- [ ] Return `{ data: GroceryRecipeSummary[] }`

### Task 3: Add types to `src/types/api.ts`
- [ ] Append `GroceryRecipeSummary` interface (returned by new API route)
- [ ] Append `GroceryRecipeGroup` interface (client-side derived type, includes `items: GroceryListItem[]`)

### Task 4: Add new hooks to `src/hooks/use-grocery.ts`
- [ ] Add `useGroceryRecipeGroups()` — `useQuery({ queryKey: ['grocery-recipe-groups'], queryFn: GET /api/grocery/recipes })`
- [ ] Add `useBulkRemoveRecipe()` — `useMutation` → `DELETE /api/grocery/bulk?recipeId=<uuid>`, invalidates `['grocery-items']` and `['grocery-recipe-groups']`
- [ ] Do NOT modify existing hooks

### Task 5: Create `src/components/grocery/grocery-recipe-view.tsx`
- [ ] Client component, reads from `useGroceryItems()` and `useGroceryRecipeGroups()`
- [ ] Derive `GroceryRecipeGroup[]` client-side by merging flat items with recipe summaries (keyed by `recipeId`)
- [ ] Render vertical list of recipe group cards per spec (thumbnail, name, restaurant, item count badge)
- [ ] Implement 3-item disclosure with "+ N more" expand on tap
- [ ] "Remove all X items" footer button (destructive style) calls `useBulkRemoveRecipe()`
- [ ] "Other items" group for `recipe_id = null` items (no image, no restaurant)
- [ ] Loading and error states handled internally
- [ ] Show sonner toast on bulk remove success/failure

### Task 6: Modify `src/app/groceries/page.tsx` to add toggle pill and crossfade
- [ ] Add `useState<'ingredients' | 'recipe'>('ingredients')` for view toggle
- [ ] Add toggle pill UI (two buttons, active/inactive styles)
- [ ] Wrap both views in opacity/pointerEvents crossfade container (both mount simultaneously)
- [ ] Import and render `<GroceryRecipeView />` alongside existing `<GroceryIngredientView />`
- [ ] Do NOT replace or rewrite existing ingredient view logic

### Task 7: Write tests
- [ ] `src/app/api/grocery/recipes/route.test.ts` — GET returns correct shape; null recipe_id group handled
- [ ] `src/components/grocery/grocery-recipe-view.test.tsx` — renders groups, disclosure toggle, bulk remove mutation called correctly
- [ ] `src/app/groceries/page.test.tsx` — toggle pill switches opacity; both views mounted simultaneously

---

## Dev Notes

### Architecture Compliance

| Concern | Requirement | Implementation |
|---|---|---|
| DB access | API routes only, never from client | All Supabase calls in `src/app/api/grocery/recipes/route.ts` and `bulk/route.ts` |
| Query caching | TanStack React Query v5 | `useGroceryRecipeGroups()` with `['grocery-recipe-groups']` key |
| Cache invalidation | Invalidate on mutation | `useBulkRemoveRecipe` invalidates both `['grocery-items']` and `['grocery-recipe-groups']` |
| Input validation | UUID validated before DB use | `recipeId` param validated with `UUID_RE` in bulk route |
| Toast feedback | sonner | Success/error toasts in `useBulkRemoveRecipe` `onSuccess`/`onError` |
| Styles | Tailwind + CSS custom properties | Use `var(--radius-md)`, `var(--text-primary)`, `var(--radius-full)` etc. |
| No direct Supabase edit | `src/integrations/supabase/` untouched | Import from `@/lib/supabase` only |

---

### Recipe Metadata Strategy: Option C (Recommended)

This story uses **Option C**: a dedicated `GET /api/grocery/recipes` route that returns recipe-level summaries with a DB-level join. This keeps the flat `GET /api/grocery` response unchanged (ingredient view continues to use `['grocery-items']` as-is) and avoids N+1 queries.

The recipe view requires TWO data sources merged client-side:
1. `useGroceryItems()` → flat `GroceryListItem[]` (existing, `['grocery-items']` key)
2. `useGroceryRecipeGroups()` → `GroceryRecipeSummary[]` with recipe metadata (`['grocery-recipe-groups']` key)

These are merged in `grocery-recipe-view.tsx` to produce `GroceryRecipeGroup[]`.

---

### New Types (`src/types/api.ts`)

Append after existing story 4.2 types:

```typescript
// Story 4.3 — returned by GET /api/grocery/recipes
export interface GroceryRecipeSummary {
  recipeId: string | null       // null = "Other items" group
  recipeName: string            // "Other items" for the null group
  dishImageUrl: string | null
  restaurantName: string | null
  itemCount: number
}

// Story 4.3 — client-side derived (not returned from API)
// Produced in grocery-recipe-view.tsx by merging GroceryListItem[] + GroceryRecipeSummary[]
export interface GroceryRecipeGroup {
  recipeId: string | null
  recipeName: string
  dishImageUrl: string | null
  restaurantName: string | null
  items: GroceryListItem[]
}
```

`GroceryRecipeGroup` is client-side only. It is not returned from any API route. It is constructed in the component by joining `GroceryListItem[]` on `recipeId`.

---

### New API Route: `src/app/api/grocery/recipes/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  // Join grocery_items → recipes → restaurants at DB level
  // Group by recipe_id to return summary rows
  // Items with recipe_id = null are returned as a single summary row with recipeId: null
}
```

The Supabase query should select:
- `grocery_items.recipe_id`
- `recipes.name` (via FK join)
- `recipes.dish_image_url` (via FK join)
- `restaurants.name` (via FK join through `recipes.restaurant_id`)
- `count(grocery_items.id)` as `itemCount`

Group by `recipe_id`. Handle null `recipe_id` as a synthetic "Other items" group.

Return shape: `{ data: GroceryRecipeSummary[] }`

Error response: `{ error: string }` with appropriate HTTP status.

---

### New Hooks (`src/hooks/use-grocery.ts` — ADDITIONS ONLY)

```typescript
// ADD after existing hooks — do not modify existing ones

export function useGroceryRecipeGroups() {
  return useQuery<GroceryRecipeSummary[]>({
    queryKey: ['grocery-recipe-groups'],
    queryFn: async () => {
      const res = await fetch('/api/grocery/recipes')
      if (!res.ok) throw new Error('Failed to fetch recipe groups')
      const json = await res.json()
      return json.data
    },
  })
}

export function useBulkRemoveRecipe() {
  const qc = useQueryClient()
  return useMutation<void, Error, string | null>({
    mutationFn: async (recipeId) => {
      const url = recipeId
        ? `/api/grocery/bulk?recipeId=${recipeId}`
        : `/api/grocery/bulk?recipeId=null`   // "Other items" group — see note below
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove recipe items')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grocery-items'] })
      qc.invalidateQueries({ queryKey: ['grocery-recipe-groups'] })
      toast.success('Recipe items removed')
    },
    onError: () => {
      toast.error('Failed to remove items')
    },
  })
}
```

**Note on "Other items" bulk remove:** Items with `recipe_id = null` cannot be bulk-removed by `recipeId` UUID. The API route must support a `?recipeId=null` literal string (or a separate `?nullRecipe=true` param) to handle this case. Implement whichever is cleaner and document in the route. Alternatively, suppress the "Remove all" button for the null group entirely — document the decision.

---

### Component Spec: `src/components/grocery/grocery-recipe-view.tsx`

```tsx
'use client'
// Props: none
// Reads: useGroceryItems(), useGroceryRecipeGroups(), useBulkRemoveRecipe()
// Derives: GroceryRecipeGroup[] by merging flat items with recipe summaries
```

**Card layout per group:**

```
┌──────────────────────────────────────────────┐
│ [48px img]  Recipe Name          [N items]   │
│             Restaurant Name                  │
├──────────────────────────────────────────────┤
│  • Ingredient 1        qty  unit             │
│  • Ingredient 2        qty  unit             │
│  • Ingredient 3        qty  unit             │
│  [+ 4 more ▾]                                │  ← shown only if >3 items
│  • Ingredient 4  (expanded)                  │
│  • Ingredient 5  (expanded)                  │
├──────────────────────────────────────────────┤
│         Remove all 7 items                   │  ← destructive/outline button
└──────────────────────────────────────────────┘
```

- Thumbnail: 48×48pt, `rounded-md`, `object-cover`; fallback to a generic plate/ingredient placeholder if `dishImageUrl` is null
- Item count badge: `text-xs`, muted background pill
- Ingredient rows: 56pt height, same visual style as ingredient view rows (story 4.2)
- "+ N more" disclosure: inline expand, no animation required (instant toggle is fine)
- "Remove all X items" button: `variant="outline"` with destructive color, `text-xs`
- "Other items" group: no thumbnail, no restaurant name, heading text "Other items"

**Loading state:** Show skeleton cards while `useGroceryRecipeGroups` is loading.
**Error state:** Show inline error message with retry button.
**Empty state:** Parent page handles empty state; this component can assume at least one group exists when rendered.

---

### Toggle and Crossfade (`src/app/groceries/page.tsx` modifications)

Add to the page (do not replace existing structure):

```tsx
const [view, setView] = useState<'ingredients' | 'recipe'>('ingredients')
```

Toggle pill (place in page header area, near the page title):

```tsx
<div
  style={{
    display: 'flex',
    borderRadius: 'var(--radius-full)',
    background: 'rgba(255,255,255,0.08)',
    padding: '2px',
    gap: '2px',
  }}
>
  {(['ingredients', 'recipe'] as const).map((v) => (
    <button
      key={v}
      onClick={() => setView(v)}
      style={{
        borderRadius: 'var(--radius-full)',
        padding: '4px 16px',
        fontSize: '0.875rem',
        fontWeight: view === v ? 600 : 400,
        background: view === v ? 'var(--bg-card, white)' : 'transparent',
        color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.15s ease, color 0.15s ease',
      }}
    >
      {v === 'ingredients' ? 'Ingredients' : 'By Recipe'}
    </button>
  ))}
</div>
```

Crossfade container (replace single-view render with):

```tsx
<div style={{ position: 'relative' }}>
  {/* Ingredient view — always mounted, opacity-toggled */}
  <div
    style={{
      opacity: view === 'ingredients' ? 1 : 0,
      transition: 'opacity 0.2s ease',
      pointerEvents: view === 'ingredients' ? 'auto' : 'none',
    }}
  >
    <GroceryIngredientView />
  </div>

  {/* Recipe view — always mounted, opacity-toggled */}
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      opacity: view === 'recipe' ? 1 : 0,
      transition: 'opacity 0.2s ease',
      pointerEvents: view === 'recipe' ? 'auto' : 'none',
    }}
  >
    <GroceryRecipeView />
  </div>
</div>
```

**Both components mount simultaneously.** This is intentional — it allows the toggle to feel instant with no loading flicker. Both `useGroceryItems()` and `useGroceryRecipeGroups()` fire on initial page render. This is acceptable for a single-user personal app.

---

### Merge Logic Note (Cross-Story Context)

Story 4.1 implements ingredient merging: when a recipe is added to the grocery list, if `ingredient_name` already exists from a different recipe, the quantities are merged into the EXISTING row. The existing row retains its ORIGINAL `recipe_id`. This means a merged item will appear under the recipe that was added FIRST — not the recipe that triggered the merge. This is by design and is the correct behavior for the recipe view.

Example:
- Recipe A (pasta) added → `olive oil, recipe_id = A`
- Recipe B (salad) added → olive oil merged into existing row → row still has `recipe_id = A`
- Recipe view: olive oil appears under Recipe A's group, not Recipe B's

Document this in a code comment on the grouping logic in `grocery-recipe-view.tsx`.

---

### Cross-Story Context

| Story | Dependency |
|---|---|
| 4.1 | `recipe_id` stored per grocery item enables this story's grouping; merge logic determines which recipe a merged item belongs to |
| 4.2 | `GET /api/grocery`, `DELETE /api/grocery/bulk` (both modes pre-built), `useGroceryItems`, `GroceryListItem` type, `GroceryIngredientView` component, groceries page — all consumed here |
| 4.4 | PWA offline caching builds on TanStack Query keys established in 4.1–4.3; `['grocery-recipe-groups']` key should be included in any offline prefetch strategy |

---

### Pre-Implementation Checklist

Before writing any code, the dev agent MUST:

1. Read `src/app/api/grocery/bulk/route.ts` and confirm whether `?recipeId=<uuid>` is already handled
2. Read `src/hooks/use-grocery.ts` to understand existing hook signatures before adding new ones
3. Read `src/types/api.ts` to confirm story 4.1 and 4.2 types are present before appending
4. Read `src/app/groceries/page.tsx` to understand current page structure before modifying

If any of the above files are missing, raise a blocker in the completion notes — do not assume.

---

## Dev Agent Record

### Agent Model Used
_To be filled by dev agent_

### Debug Log References
_None_

### Completion Notes List
_To be filled by dev agent_

### File List

**Create:**
- `src/app/api/grocery/recipes/route.ts`
- `src/app/api/grocery/recipes/route.test.ts`
- `src/components/grocery/grocery-recipe-view.tsx`
- `src/components/grocery/grocery-recipe-view.test.tsx`

**Modify:**
- `src/types/api.ts` — append `GroceryRecipeSummary` and `GroceryRecipeGroup` interfaces
- `src/hooks/use-grocery.ts` — append `useGroceryRecipeGroups()` and `useBulkRemoveRecipe()` hooks
- `src/app/groceries/page.tsx` — add toggle pill state + UI + crossfade container
- `src/app/groceries/page.test.tsx` — extend with toggle pill and dual-mount tests
- `src/app/api/grocery/bulk/route.ts` — only if `?recipeId` mode is missing (verify first)

---

## Change Log

- 2026-03-22: Story 4.3 created
