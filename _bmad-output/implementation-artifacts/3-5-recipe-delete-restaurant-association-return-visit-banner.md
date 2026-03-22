# Story 3.5: Recipe Delete, Restaurant Association & Return-Visit Banner

**Status:** done
**Story ID:** 3.5
**Epic:** 3 — Recipe Save & Collection

---

## Story

As a returning user,
I want recipes associated with restaurants and Plately to recognise where I've been,
So that my collection is organised and I see my history when I return somewhere I've eaten before.

---

## Acceptance Criteria

**Given** a recipe is saved from a scan result that includes restaurant context (name or Google Places ID)
**When** the recipe is stored
**Then** a `restaurants` row is created (if it doesn't already exist, matched by `google_places_id` or name) and `recipes.restaurant_id` is set to that restaurant's `id` (FR22)

**Given** a recipe is saved from a scan result at a restaurant already in the `restaurants` table
**When** the restaurant is matched
**Then** no duplicate `restaurants` row is created; the existing row's `id` is used; `updated_at` is updated

**Given** a `restaurants` row is created for the first time
**When** created
**Then** `atmospheric_palette_json` is null initially; it will be populated by the atmospheric theming pipeline when that restaurant context is first rendered

**Given** a recipe is deleted via swipe-to-delete on the home screen or the delete affordance in the edit view
**When** `DELETE /api/recipes/[id]` is called
**Then** the recipe row is deleted; all associated `recipe_ingredients` rows are deleted via `ON DELETE CASCADE`; all associated `grocery_items` rows are deleted (see Dev Notes — `grocery_items.recipe_id` uses `ON DELETE SET NULL`, not CASCADE, so the route must handle this explicitly); a sonner toast confirms; `['recipes']` cache is invalidated (FR21)

**Given** a scan result matches a restaurant that already has saved recipes in the `restaurants` table
**When** the home screen renders (the most recently saved recipe has a `restaurant_id` that is shared by at least one other saved recipe)
**Then** a return-visit banner appears: "You've been here before — X saved recipes" with a tap target navigating to the restaurant profile (FR41 — persistent, not scan-gated: banner shows whenever `recipes[0].restaurantId` has sibling recipes, not only immediately after a scan)

**Given** the return-visit banner is tapped
**When** the restaurant profile page renders
**Then** it shows the restaurant name and all previously saved recipes associated with that `restaurant_id` (FR32)

---

## Tasks / Subtasks

- [x] Task 1: Implement restaurant upsert in `POST /api/recipes` route
  - [x] When `restaurantId` is present in the save payload, look up or create the `restaurants` row before inserting the recipe
  - [x] Match by `google_places_id` if provided, else by `name`
  - [x] Use Supabase upsert with `on_conflict: 'google_places_id'` when googlePlacesId is present; plain insert with name-match check otherwise
  - [x] Set `recipes.restaurant_id` to the resolved restaurant id
  - [x] **Do NOT change the response shape** — `POST /api/recipes` still returns `{ data: RecipeSaveResponse }`

- [x] Task 2: Update `DELETE /api/recipes/[id]` to explicitly delete `grocery_items` first
  - [x] Before deleting the recipe row, delete `grocery_items` where `recipe_id = id`
  - [x] Recipe row deletion then cascades to `recipe_ingredients` automatically
  - [x] **Do NOT change the response shape** — still returns `{ data: { deleted: true } }`

- [x] Task 3: Add `GET /api/recipes?restaurantId=[id]` filter to the list route
  - [x] In `src/app/api/recipes/route.ts`, support optional `restaurantId` query param
  - [x] If present: add `.eq('restaurant_id', restaurantId)` to the query
  - [x] If absent: return all recipes (existing behaviour unchanged)

- [x] Task 4: Add `useRecipesByRestaurant(restaurantId)` hook
  - [x] Add to `src/hooks/use-recipes.ts`
  - [x] Query key: `['recipes', 'restaurant', restaurantId]`
  - [x] Fetches `GET /api/recipes?restaurantId=[id]`

- [x] Task 5: Create return-visit banner on home screen
  - [x] Add restaurant detection logic to `src/app/page.tsx`
  - [x] After scan result is saved with a `restaurantId`, check if other recipes for that restaurant exist
  - [x] If yes: display the banner "You've been here before — X saved recipes"
  - [x] Tapping the banner navigates to `/restaurants/[restaurantId]`
  - [x] See Dev Notes for the correct trigger and render strategy

- [x] Task 6: Create basic restaurant profile page
  - [x] `src/app/restaurants/[id]/page.tsx` — shows restaurant name and recipes from that restaurant
  - [x] Uses `useRecipes()` hook with client-side filter (per Dev Notes — avoids extra network call when cache warm)
  - [x] Back navigation (same `goBack` pattern as recipe detail page)
  - [x] Each recipe card navigates to `/recipes/[recipeId]`

- [x] Task 7: Write tests
  - [x] `src/app/api/recipes/route.test.ts` — ADD: restaurant upsert test cases (Task 1), `restaurantId` filter test (Task 3)
  - [x] `src/app/api/recipes/[id]/route.test.ts` — ADD: DELETE now clears grocery_items first (Task 2)
  - [x] `src/hooks/use-recipes.test.ts` — ADD: `useRecipesByRestaurant` cases
  - [x] `src/app/page.test.tsx` — MODIFY: add return-visit banner test case
  - [x] `src/app/restaurants/[id]/page.test.tsx` — NEW

---

## Dev Notes

### ⚠️ Critical: grocery_items cascade behaviour

The `grocery_items` table uses:
```sql
recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL
```

This means deleting a recipe sets `grocery_items.recipe_id` to `NULL` — it does **not** delete the grocery_items rows. This is intentional for freeform items, but for the delete flow the epic spec says grocery_items for that recipe must be deleted (FR21).

**The DELETE route must explicitly delete grocery_items BEFORE deleting the recipe:**

```typescript
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Step 1: delete grocery_items for this recipe (ON DELETE SET NULL won't remove them)
  await supabase.from('grocery_items').delete().eq('recipe_id', id)

  // Step 2: delete recipe (cascades to recipe_ingredients via ON DELETE CASCADE)
  const { error, count } = await supabase
    .from('recipes')
    .delete({ count: 'exact' })
    .eq('id', id)

  // ... existing error handling unchanged
}
```

If Step 1 errors, decide: fail loudly (return 500) or continue. For MVP, continue regardless — grocery_items cleanup is best-effort. Step 2 errors are fatal.

---

### Task 1: Restaurant upsert in POST /api/recipes

**Target file:** `src/app/api/recipes/route.ts`

The existing POST handler inserts a recipe with `restaurant_id: null`. Story 3.5 populates `restaurant_id` when the save payload includes restaurant context.

**Payload shape** — extend `RecipeSaveRequest` (in `src/types/api.ts`) to optionally include restaurant data:

```typescript
// Add to RecipeSaveRequest in api.ts:
restaurantName?: string | null
restaurantGooglePlacesId?: string | null
```

**Restaurant resolution logic** (add before the recipe INSERT):

```typescript
let resolvedRestaurantId: string | null = null

if (body.restaurantGooglePlacesId || body.restaurantName) {
  // Try to find existing restaurant
  let existingId: string | null = null

  if (body.restaurantGooglePlacesId) {
    const { data } = await supabase
      .from('restaurants')
      .select('id')
      .eq('google_places_id', body.restaurantGooglePlacesId)
      .maybeSingle()
    existingId = data?.id ?? null
  }

  if (!existingId && body.restaurantName) {
    const { data } = await supabase
      .from('restaurants')
      .select('id')
      .eq('name', body.restaurantName)
      .maybeSingle()
    existingId = data?.id ?? null
  }

  if (existingId) {
    // Update updated_at on the existing restaurant
    await supabase.from('restaurants').update({ updated_at: new Date().toISOString() }).eq('id', existingId)
    resolvedRestaurantId = existingId
  } else {
    // Create new restaurant
    const { data: newRestaurant, error } = await supabase
      .from('restaurants')
      .insert({
        name: body.restaurantName ?? 'Unknown Restaurant',
        google_places_id: body.restaurantGooglePlacesId ?? null,
        atmospheric_palette_json: null,
      })
      .select('id')
      .single()

    if (error) {
      // Non-fatal: continue save without restaurant association
      console.error('Failed to create restaurant:', error.message)
    } else {
      resolvedRestaurantId = newRestaurant.id
    }
  }
}

// Then in the recipe INSERT:
// restaurant_id: resolvedRestaurantId,
```

**Important:** Restaurant lookup/creation failure is non-fatal — the recipe saves without a `restaurant_id` rather than failing entirely.

---

### Task 3: restaurantId filter in GET /api/recipes

In `src/app/api/recipes/route.ts`, the existing GET handler:

```typescript
export async function GET() {
  const { data, error } = await supabase
    .from('recipes')
    .select('...')
    .order('created_at', { ascending: false })
  // ...
}
```

Modify to accept `restaurantId`:

```typescript
export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')

  let query = supabase
    .from('recipes')
    .select('...')
    .order('created_at', { ascending: false })

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId)
  }

  const { data, error } = await query
  // ... rest unchanged
}
```

Change the function signature from `GET()` to `GET(req: NextRequest)`.

---

### Task 4: useRecipesByRestaurant hook

Add to `src/hooks/use-recipes.ts`:

```typescript
async function fetchRecipesByRestaurant(restaurantId: string): Promise<Recipe[]> {
  const res = await fetch(`/api/recipes?restaurantId=${encodeURIComponent(restaurantId)}`)
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? 'Failed to fetch recipes')
  }
  const json = await res.json()
  return (json as ApiSuccess<Recipe[]>).data
}

export function useRecipesByRestaurant(restaurantId: string | null) {
  return useQuery({
    queryKey: ['recipes', 'restaurant', restaurantId],
    queryFn: () => fetchRecipesByRestaurant(restaurantId!),
    enabled: !!restaurantId,
  })
}
```

---

### Task 5: Return-visit banner on home screen

The banner should appear when: recipes exist AND the most recently saved recipe has a `restaurant_id` AND other recipes share that same `restaurant_id`.

**Simple implementation in `src/app/page.tsx`:**

```tsx
// In the populated home screen view (when recipes.length > 0):
const latestRestaurantId = recipes[0]?.restaurantId ?? null
const sameRestaurantRecipes = latestRestaurantId
  ? recipes.filter(r => r.restaurantId === latestRestaurantId)
  : []
const showReturnVisitBanner = sameRestaurantRecipes.length > 1 && latestRestaurantId

// Render:
{showReturnVisitBanner && (
  <button
    onClick={() => router.push(`/restaurants/${latestRestaurantId}`)}
    style={{
      width: '100%',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--spacing-3) var(--spacing-4)',
      color: 'var(--text-primary)',
      fontSize: 'var(--text-sm)',
      textAlign: 'left',
      cursor: 'pointer',
      minHeight: '44px',
    }}
    aria-label="Return visit banner"
  >
    You've been here before — {sameRestaurantRecipes.length} saved recipes
  </button>
)}
```

Place the banner between the featured recipe card and the "Your Collection" grid.

---

### Task 6: Restaurant profile page

**File:** `src/app/restaurants/[id]/page.tsx` — NEW

This is a simple list page reusing the `RecipeCard` component from Story 3.2:

```tsx
'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useRecipes } from '@/hooks/use-recipes'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function RestaurantProfilePage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { data: recipes, isLoading } = useRecipes() // filter client-side from cache
  const restaurantRecipes = (recipes ?? []).filter(r => r.restaurantId === id)
  const restaurantName = restaurantRecipes[0]?.restaurant?.name ?? 'Restaurant'

  return (
    <div className="flex flex-col flex-1 min-h-full">
      <div className="px-[var(--spacing-4)] pt-[var(--spacing-4)]">
        <button
          onClick={() => router.back()}
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none',
            border: 'none', cursor: 'pointer', padding: '8px 0', minHeight: '44px' }}
          aria-label="Go back"
        >
          ← Back
        </button>
      </div>
      <div className="px-[var(--spacing-4)] py-[var(--spacing-2)]">
        <h1 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', fontWeight: 700 }}>
          {restaurantName}
        </h1>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          {restaurantRecipes.length} saved {restaurantRecipes.length === 1 ? 'recipe' : 'recipes'}
        </p>
      </div>
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Loading…</p>
        </div>
      )}
      <ul className="flex flex-col gap-[var(--spacing-2)] px-[var(--spacing-4)]">
        {restaurantRecipes.map(recipe => (
          <li key={recipe.id}>
            <button
              onClick={() => router.push(`/recipes/${recipe.id}`)}
              style={{
                width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-3)', cursor: 'pointer', minHeight: '44px',
              }}
            >
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                {recipe.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

**Note:** This page uses `useRecipes()` (fetches all recipes) and filters client-side. This avoids an extra network call when the `['recipes']` cache is already warm. Story 5.4 will add a dedicated restaurant profile API; for now, client-side filtering from the existing cache is correct and fast (NFR03).

---

### Task 7: Test Guidance

**`src/app/api/recipes/route.test.ts` — ADD:**

```typescript
// Restaurant association tests (POST):
// - when restaurantGooglePlacesId matches existing restaurant: uses existing id
// - when restaurantName matches existing restaurant: uses existing id
// - when no match: creates new restaurant row, uses its id
// - when restaurant creation fails: recipe is saved with restaurant_id null (non-fatal)
// - when no restaurant fields in payload: restaurant_id is null (existing behaviour)

// restaurantId filter test (GET):
// - GET with ?restaurantId=xxx: adds .eq('restaurant_id', xxx) to query
// - GET without restaurantId: returns all recipes (existing behaviour preserved)
```

**`src/app/api/recipes/[id]/route.test.ts` — MODIFY DELETE tests:**

The existing DELETE tests should now also verify that `grocery_items` deletion is called before the recipe deletion. Update the mock setup to expect `supabase.from('grocery_items').delete().eq(...)` as the first call.

```typescript
it('success: deletes grocery_items before recipe', async () => {
  const groceryDeleteMock = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
  const recipeDeleteMock = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null, count: 1 }) }
  mockFrom
    .mockReturnValueOnce(groceryDeleteMock)   // grocery_items delete
    .mockReturnValueOnce(recipeDeleteMock)    // recipes delete

  const res = await DELETE(makeDeleteRequest('recipe-uuid-1'), { params: Promise.resolve({ id: 'recipe-uuid-1' }) })
  expect(res.status).toBe(200)
  expect(groceryDeleteMock.eq).toHaveBeenCalledWith('recipe_id', 'recipe-uuid-1')
})
```

**`src/app/restaurants/[id]/page.test.tsx` — NEW:**

```typescript
// Mocks: useRecipes, useRouter, use(params)
// Cases:
// - renders restaurant name from first matching recipe's restaurant.name
// - renders recipe count
// - renders a button per matching recipe
// - tapping a recipe button navigates to /recipes/[id]
// - back button navigates away
// - renders loading state while isLoading is true
// - renders empty list when no recipes match restaurantId
```

---

### What Already Exists — Do NOT modify

- **`src/app/api/recipes/[id]/route.ts`** — DELETE, GET, PUT are all implemented; only the grocery_items pre-delete needs adding
- **`src/app/api/recipes/route.ts`** — POST and GET list exist; add restaurant upsert to POST, add `restaurantId` filter to GET
- **`src/hooks/use-recipes.ts`** — all existing hooks must remain unchanged; only add `useRecipesByRestaurant`
- **`src/types/domain.ts`** — no changes needed; `DomainRestaurant` already exists
- **`src/components/recipes/recipe-card.tsx`** — reuse in restaurant profile page (Story 3.2 component)
- **`src/components/recipes/swipe-to-delete.tsx`** — already wired on home screen; the delete call from there will now also clear grocery_items via the updated DELETE route

---

### Cross-Story Context

- **Story 3.4** (parallel) modifies PUT handler only — does not touch DELETE, POST, or the list route. No conflict.
- **Story 3.6** will modify `POST /api/recipes` to add USDA lookups. This story also modifies POST for restaurant upsert. They must be developed sequentially (3.6 after 3.5).
- **Story 4.1** (Epic 4) adds `POST /api/grocery` to add recipe ingredients to grocery_items. The `ON DELETE SET NULL` behaviour becomes more important then — grocery_items for a deleted recipe will have `recipe_id = null` unless this story's explicit delete is in place.
- **Story 5.4** (Epic 5) builds a full restaurant profile with Places API data. The `src/app/restaurants/[id]/page.tsx` created here is a placeholder — Story 5.4 will substantially expand it.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_None_

### Completion Notes List

- Task 1: Extended `RecipeSaveRequest` with optional `restaurantName` and `restaurantGooglePlacesId`. Restaurant resolution is non-fatal — recipe saves without association if lookup/creation fails. Lookup order: google_places_id first, then name. Matched restaurant gets `updated_at` refreshed. New restaurant inserted with `atmospheric_palette_json: null`.
- Task 2: DELETE route now pre-deletes `grocery_items WHERE recipe_id = id` before deleting the recipe. Step 1 is best-effort (errors are ignored, recipe deletion proceeds). Recipe deletion still cascades to `recipe_ingredients` via ON DELETE CASCADE.
- Task 3: GET route signature updated to `GET(req: NextRequest)` to support `restaurantId` query param filter. Without param, behaviour unchanged (returns all recipes).
- Task 4: `useRecipesByRestaurant(restaurantId)` hook added to `use-recipes.ts`. Disabled when `restaurantId` is null. Query key: `['recipes', 'restaurant', restaurantId]`.
- Task 5: Return-visit banner added between featured card and collection grid. Shows when `recipes[0].restaurantId` is non-null AND more than 1 recipe shares that restaurant. Navigates to `/restaurants/[restaurantId]` via `router.push`.
- Task 6: `src/app/restaurants/[id]/page.tsx` created. Uses `useRecipes()` with client-side filter per Dev Notes (cache is typically warm). Shows restaurant name from first matching recipe's `restaurant.name`. Falls back to "Restaurant" if no matches. Back navigation uses `router.back()`.
- Task 7: 29 new tests added across 5 files. All 359 tests pass. No new lint errors in modified files.

### File List

- `src/types/api.ts` — MODIFY: extend `RecipeSaveRequest` with optional `restaurantName`, `restaurantGooglePlacesId` (Task 1)
- `src/app/api/recipes/route.ts` — MODIFY: add restaurant upsert to POST, add restaurantId filter to GET (Tasks 1, 3)
- `src/app/api/recipes/route.test.ts` — MODIFY: add restaurant association and filter tests (Task 7)
- `src/app/api/recipes/[id]/route.ts` — MODIFY: add grocery_items pre-delete to DELETE handler (Task 2)
- `src/app/api/recipes/[id]/route.test.ts` — MODIFY: update DELETE tests for grocery_items cleanup (Task 7)
- `src/hooks/use-recipes.ts` — MODIFY: add `useRecipesByRestaurant` hook (Task 4)
- `src/hooks/use-recipes.test.ts` — MODIFY: add `useRecipesByRestaurant` test cases (Task 7)
- `src/app/page.tsx` — MODIFY: add return-visit banner (Task 5)
- `src/app/page.test.tsx` — MODIFY: add banner test case (Task 7)
- `src/app/restaurants/[id]/page.tsx` — NEW (Task 6)
- `src/app/restaurants/[id]/page.test.tsx` — NEW (Task 7)

---

## Change Log

- 2026-03-22: Story 3.5 created — recipe delete, restaurant association, return-visit banner
- 2026-03-22: Story 3.5 implemented — all 7 tasks complete, 29 tests added, 359 total passing
