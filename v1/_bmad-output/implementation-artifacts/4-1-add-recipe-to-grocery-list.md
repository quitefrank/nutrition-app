# Story 4.1: Add Recipe to Grocery List

**Status:** done
**Story ID:** 4.1
**Epic:** 4 — Grocery List

---

## Story

As a user with a saved recipe,
I want to add all its ingredients to my grocery list in one tap,
So that I can shop for the meal without manually entering each item.

---

## Acceptance Criteria

**Given** the recipe detail page is open
**When** the user taps "Add to Grocery List"
**Then** all ingredients from the recipe are added to `grocery_items`; each row stores `recipe_id`, `ingredient_name`, `quantity`, `unit`, and `checked: false`; a sonner toast confirms "X ingredients added to your grocery list"; the `['grocery-items']` cache is invalidated

**Given** the `POST /api/grocery` route receives a `recipeId`
**When** called
**Then** it fetches `recipe_ingredients` for that recipe and upserts into `grocery_items`; it returns `{ data: { added: number, merged: number } }` with HTTP 200

**Given** an ingredient with the same name already exists in `grocery_items` (unchecked)
**When** new ingredients from a second recipe are added
**Then** the existing item's quantity is merged/incremented rather than creating a duplicate row; the `recipe_id` on the merged row is **not** changed (retained as original); `merged` count is incremented

**Given** the add action completes
**When** the user taps the Grocery tab
**Then** the grocery list immediately reflects the newly added ingredients; no reload or pull-to-refresh is required (cache invalidation handles it)

**Given** the recipe has no saved ingredients
**When** the recipe detail page is open
**Then** the "Add to Grocery List" button is disabled (no ingredients to add)

---

## Tasks / Subtasks

- [x] Task 1: Add grocery API types to `src/types/api.ts`
  - [x] Add `GroceryAddRequest` interface (see Dev Notes)
  - [x] Add `GroceryAddResponse` interface (see Dev Notes)
  - [x] Add alongside existing types — do NOT modify other types

- [x] Task 2: Create `POST /api/grocery` route
  - [x] Create new file `src/app/api/grocery/route.ts`
  - [x] UUID validation on `recipeId`
  - [x] Fetch `recipe_ingredients` for the recipe
  - [x] Fetch existing unchecked `grocery_items` to build merge map
  - [x] For each ingredient: merge if name matches (case-insensitive), insert if new
  - [x] Return `{ data: { added, merged } }`
  - [x] See Dev Notes for full implementation spec

- [x] Task 3: Create `useAddToGrocery` hook in `src/hooks/use-grocery.ts`
  - [x] NEW file — this is the first grocery hook
  - [x] `useMutation` calling `POST /api/grocery` with `recipeId`
  - [x] On success: invalidate `['grocery-items']`, show sonner toast
  - [x] On error: show sonner error toast

- [x] Task 4: Wire up button in `src/components/recipes/recipe-detail.tsx`
  - [x] Import `useAddToGrocery` from `@/hooks/use-grocery`
  - [x] Add `useAddToGrocery` to the component body
  - [x] Replace the `disabled` button with a functional one (see Dev Notes)
  - [x] Show "Adding…" while `isPending`; disable during pending

- [x] Task 5: Write tests
  - [x] `src/app/api/grocery/route.test.ts` — NEW (see Dev Notes)
  - [x] `src/hooks/use-grocery.test.ts` — NEW (see Dev Notes)
  - [x] `src/components/recipes/recipe-detail.test.tsx` — MODIFY: replace `disabled` button assertions with functional button test

---

## Dev Notes

### Architecture Compliance

| Rule | This story |
|------|-----------|
| `{ data: T }` / `{ error, code }` shapes | POST returns `{ data: { added, merged } }` (200) or `{ error, code }` (400/500) |
| `supabase` from `@/lib/supabase` | Import singleton — never inline |
| TanStack Query keys | Invalidate `['grocery-items']` on success |
| `'use client'` | Hook file + RecipeDetail (already client) |
| UUID validation | Define `UUID_RE` locally in grocery route (same pattern as recipes routes) |
| camelCase TS / snake_case DB | Map in route: `ingredient_name` (DB) ↔ `name` (recipe_ingredients), `ingredientName` would be TS but ingredient rows use `name` column |
| NFR15 | All interactive elements ≥ 44pt; "Add to Grocery List" button is already 56pt height |

---

### Existing Code NOT to Modify

- **`src/hooks/use-recipes.ts`** — all recipe hooks are complete; do NOT add grocery logic here
- **`src/types/domain.ts`** — `DomainGroceryItem` already exists (lines 51-58); do NOT redefine
- **`src/app/api/recipes/[id]/route.ts`** — DELETE handler already cascades to `grocery_items`; do NOT touch
- **`src/integrations/supabase/`** — auto-generated; do NOT edit

### Current Test State Warning

Stories 3.5 is in "review" status and has modified `src/app/api/recipes/route.test.ts`, `src/app/api/recipes/route.ts`, `src/app/page.test.tsx`, and `src/app/page.tsx`. There may be failing tests from that work-in-progress. Only fix failures introduced by your changes.

---

### Database Schema: `grocery_items`

Column names (snake_case, from `src/types/database.ts`):

```typescript
grocery_items.Row = {
  id: string               // UUID, auto-generated
  recipe_id: string | null // FK to recipes.id — enables recipe-view grouping (Story 4.2/4.3)
  ingredient_name: string  // NOT ing.name directly — store the display name
  quantity: string | null  // string, not number (e.g. "2", "to taste", null)
  unit: string | null
  checked: boolean         // default false
  created_at: string
}
```

> **Note:** `recipe_ingredients` uses column `name` for ingredient name. `grocery_items` uses `ingredient_name`. Map correctly.

---

### Task 1: API Types

Add to **`src/types/api.ts`** (after `RecipeUpdateRequest`):

```typescript
// ─── Grocery API ──────────────────────────────────────────────────────────────

export interface GroceryAddRequest {
  recipeId: string
}

export interface GroceryAddResponse {
  added: number
  merged: number
}
```

---

### Task 2: POST /api/grocery Route

**File:** `src/app/api/grocery/route.ts` — NEW file. Create directory `src/app/api/grocery/` first.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { GroceryAddRequest, GroceryAddResponse } from '@/types/api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mergeQuantity(existing: string | null, incoming: string | null): string | null {
  if (!existing) return incoming
  if (!incoming) return existing
  const a = parseFloat(existing)
  const b = parseFloat(incoming)
  if (!isNaN(a) && !isNaN(b)) {
    const sum = a + b
    return Number.isInteger(sum) ? String(sum) : String(Math.round(sum * 100) / 100)
  }
  // Non-numeric quantities (e.g. "to taste"): retain existing
  return existing
}

export async function POST(req: NextRequest) {
  let body: GroceryAddRequest
  try {
    body = await req.json() as GroceryAddRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  if (!body.recipeId || !UUID_RE.test(body.recipeId)) {
    return NextResponse.json({ error: 'Invalid recipeId', code: 'BAD_REQUEST' }, { status: 400 })
  }

  // Fetch recipe ingredients
  const { data: ingredients, error: ingError } = await supabase
    .from('recipe_ingredients')
    .select('id, name, quantity, unit')
    .eq('recipe_id', body.recipeId)

  if (ingError) {
    return NextResponse.json({ error: 'Failed to fetch recipe ingredients', code: 'DB_ERROR' }, { status: 500 })
  }

  if (!ingredients || ingredients.length === 0) {
    return NextResponse.json({ data: { added: 0, merged: 0 } satisfies GroceryAddResponse })
  }

  // Fetch existing UNCHECKED grocery items to detect duplicates
  // Checked items are "done" — we treat them as not present for merge purposes
  const { data: existingItems, error: fetchError } = await supabase
    .from('grocery_items')
    .select('id, ingredient_name, quantity')
    .eq('checked', false)

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch grocery list', code: 'DB_ERROR' }, { status: 500 })
  }

  // Build lookup map keyed by lowercase ingredient_name
  const existingMap = new Map(
    (existingItems ?? []).map(item => [item.ingredient_name.toLowerCase(), item])
  )

  let added = 0
  let merged = 0

  for (const ing of ingredients) {
    const normalizedName = ing.name.toLowerCase()
    const existing = existingMap.get(normalizedName)

    if (existing) {
      // Merge: update quantity; retain existing recipe_id (for recipe-view grouping)
      const mergedQty = mergeQuantity(existing.quantity, ing.quantity)
      const { error: updateError } = await supabase
        .from('grocery_items')
        .update({ quantity: mergedQty })
        .eq('id', existing.id)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to merge grocery item', code: 'DB_ERROR' }, { status: 500 })
      }
      merged++
    } else {
      // Insert new row
      const { error: insertError } = await supabase
        .from('grocery_items')
        .insert({
          recipe_id: body.recipeId,
          ingredient_name: ing.name,
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          checked: false,
        })

      if (insertError) {
        return NextResponse.json({ error: 'Failed to add grocery item', code: 'DB_ERROR' }, { status: 500 })
      }
      // Add to map so within-recipe duplicate names are also merged
      existingMap.set(normalizedName, { id: 'new', ingredient_name: ing.name, quantity: ing.quantity ?? null })
      added++
    }
  }

  return NextResponse.json({ data: { added, merged } satisfies GroceryAddResponse })
}
```

**Key design decisions:**
- `mergeQuantity`: numeric add if both parseable (e.g., "2" + "1" = "3"); otherwise retain existing
- Within-recipe deduplication: if a recipe has two "butter" entries, the second is merged too
- `recipe_id` is NOT updated on merged rows — original recipe association preserved for Story 4.3's recipe-view grouping
- Checked items excluded from merge detection — "done" items shouldn't absorb new quantities

---

### Task 3: useAddToGrocery Hook

**File:** `src/hooks/use-grocery.ts` — NEW file.

```typescript
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { GroceryAddRequest, GroceryAddResponse, ApiSuccess } from '@/types/api'

export function useAddToGrocery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (recipeId: string): Promise<GroceryAddResponse> => {
      const res = await fetch('/api/grocery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId } satisfies GroceryAddRequest),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to add to grocery list')
      }
      const json = await res.json()
      return (json as ApiSuccess<GroceryAddResponse>).data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
      const total = data.added + data.merged
      if (total > 0) {
        toast.success(`${total} ingredients updated on your grocery list`)
      } else {
        toast.info('No ingredients to add')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
```

**Pattern notes:**
- Import `toast` from `'sonner'` (same as recipe hooks)
- `void queryClient.invalidateQueries(...)` — same pattern as all existing hooks
- Error toast uses the server's error message (already sanitised in the route)
- `['grocery-items']` key will be used by Stories 4.2/4.3 for list queries

---

### Task 4: Wire Up Button in RecipeDetail

**File:** `src/components/recipes/recipe-detail.tsx` — MODIFY.

**Step 1:** Add import at top (after existing imports):

```typescript
import { useAddToGrocery } from '@/hooks/use-grocery'
```

**Step 2:** Add hook to `RecipeDetail` component body (after `const ingredients = recipe.ingredients ?? []`):

```typescript
const { mutate: addToGrocery, isPending: isAddingToGrocery } = useAddToGrocery()
```

**Step 3:** Replace the entire disabled button block (currently lines 96–113):

```tsx
{/* Add to Grocery List CTA */}
<button
  onClick={() => addToGrocery(recipe.id)}
  disabled={isAddingToGrocery}
  style={{
    width: '100%',
    height: '56px',
    borderRadius: 'var(--radius-xl)',
    background: isAddingToGrocery ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)',
    color: isAddingToGrocery ? 'var(--text-tertiary)' : 'var(--text-primary)',
    fontWeight: 600,
    fontSize: 'var(--text-base)',
    border: 'none',
    cursor: isAddingToGrocery ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s, color 0.15s',
  }}
  aria-label="Add to Grocery List"
>
  {isAddingToGrocery ? 'Adding…' : 'Add to Grocery List'}
</button>
```

**Do NOT modify** anything else in the component: `RecipeDetailProps`, `useSetAtmospheric`, the dish image block, the ingredient list, or `IngredientRow`.

---

### Task 5: Test Guidance

#### `src/app/api/grocery/route.test.ts` — NEW

Standard mock setup (same as all route tests):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

function makeRequest(body: object) {
  return new Request('http://localhost/api/grocery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

const RECIPE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('POST /api/grocery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalid UUID → 400 BAD_REQUEST', async () => {
    const res = await POST(makeRequest({ recipeId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('missing recipeId → 400 BAD_REQUEST', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('empty ingredients list → 200 with { added: 0, merged: 0 }', async () => {
    // Call 1: recipe_ingredients → empty
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 0, merged: 0 })
  })

  it('all new ingredients → 200 with { added: 2, merged: 0 }', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'g' },
      { id: 'i2', name: 'Eggs', quantity: '2', unit: null },
    ]
    // Call 1: recipe_ingredients
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    // Call 2: existing grocery_items (none)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    // Calls 3 & 4: insert each ingredient
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 2, merged: 0 })
  })

  it('one matching unchecked item → 200 with { added: 1, merged: 1 }', async () => {
    const fakeIngredients = [
      { id: 'i1', name: 'Butter', quantity: '100', unit: 'g' },
      { id: 'i2', name: 'Eggs', quantity: '2', unit: null },
    ]
    const existingGrocery = [
      { id: 'g1', ingredient_name: 'Butter', quantity: '50' },
    ]
    // Call 1: recipe_ingredients
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: fakeIngredients, error: null }),
    })
    // Call 2: existing grocery_items
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: existingGrocery, error: null }),
    })
    // Call 3: update Butter (merge)
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // Call 4: insert Eggs
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ added: 1, merged: 1 })
  })

  it('DB error on fetch ingredients → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    })
    const res = await POST(makeRequest({ recipeId: RECIPE_ID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})
```

> **Mocking note:** `mockFrom` is called sequentially per `supabase.from(tableName)` call. Use `mockReturnValueOnce` for each call in order: (1) `recipe_ingredients`, (2) `grocery_items`, (3+) update/insert per ingredient.

#### `src/hooks/use-grocery.test.ts` — NEW

Follow the `use-recipes.test.ts` pattern exactly. Key test cases:

```typescript
// Mock setup (same pattern as use-recipes.test.ts):
vi.mock('next/server', () => ({}))  // if needed
// Mock global fetch
// Mock sonner: vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError, info: mockToastInfo } }))
// Mock queryClient: vi.mock('@tanstack/react-query', ...)

// Tests:
// - mutationFn calls POST /api/grocery with correct recipeId
// - onSuccess: invalidates ['grocery-items'] queryKey
// - onSuccess: calls toast.success with correct count when total > 0
// - onSuccess: calls toast.info('No ingredients to add') when total === 0
// - onError: calls toast.error with error message
// - mutationFn throws when response is not ok
```

#### `src/components/recipes/recipe-detail.test.tsx` — MODIFY

Find and update any test that asserts the "Add to Grocery List" button is `disabled` or `aria-label="Add to Grocery List (coming soon)"`:

```typescript
// Before (old disabled assertion):
expect(button).toBeDisabled()
// OR: expect(button.getAttribute('aria-label')).toBe('Add to Grocery List (coming soon)')

// After:
expect(button).not.toBeDisabled()
expect(button.getAttribute('aria-label')).toBe('Add to Grocery List')
// Also add: clicking button calls addToGrocery(recipe.id)
```

If no existing test covers this button, add:

```typescript
it('Add to Grocery List button is enabled and calls addToGrocery on click', () => {
  // mock useAddToGrocery: vi.mock('@/hooks/use-grocery', ...)
  render(<RecipeDetail recipe={mockRecipe} />)
  const button = screen.getByRole('button', { name: /Add to Grocery List/i })
  expect(button).not.toBeDisabled()
  fireEvent.click(button)
  expect(mockAddToGrocery).toHaveBeenCalledWith(mockRecipe.id)
})
```

---

### Cross-Story Context

- **Story 4.2** will add `GET /api/grocery` + `useGroceryItems()` hook + the grocery list UI. The `['grocery-items']` invalidation in this story ensures Story 4.2's query auto-refreshes.
- **Story 4.3** will add recipe-view grouping using `recipe_id` on `grocery_items` rows. The `recipe_id` we store here (and retain on merges) is what enables that grouping — do NOT omit it or set to null.
- **Story 4.4** adds offline PWA support; the grocery list caching from TanStack Query set up here will be leveraged.
- **Story 3.5** (in review) touches `src/app/page.tsx` and related tests. Avoid conflicts there.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_None_

### Completion Notes List

- Task 1: Added `GroceryAddRequest` and `GroceryAddResponse` interfaces to `src/types/api.ts` after `RecipeUpdateRequest`
- Task 2: Created `src/app/api/grocery/route.ts` with POST handler. Implements sequential merge loop: fetch recipe_ingredients → fetch unchecked grocery_items → for each ingredient, update if name match (case-insensitive), insert if new. `mergeQuantity` adds numerically when both values are parseable floats; retains existing for non-numeric (e.g. "to taste"). Within-recipe deduplication handled by updating the existingMap after each insert.
- Task 3: Created `src/hooks/use-grocery.ts` with `useAddToGrocery` hook. Uses `useMutation` pattern matching existing recipe hooks. Invalidates `['grocery-items']` on success; shows `toast.success(N ingredients added)` or `toast.info('No ingredients to add')` depending on total count.
- Task 4: Modified `src/components/recipes/recipe-detail.tsx` — added `useAddToGrocery` import and hook call, replaced the disabled "coming soon" button with a functional button that calls `addToGrocery(recipe.id)` and shows "Adding…" when `isPending`.
- Task 5: Added 8 route tests, 7 hook tests, updated recipe-detail test (replaced disabled assertion with enabled+click test). vi.hoisted() required for sonner mock in use-grocery.test.ts. All 396 tests pass (389 baseline + 7 new).

### File List

- `src/types/api.ts` — MODIFY: add `GroceryAddRequest`, `GroceryAddResponse` (Task 1)
- `src/app/api/grocery/route.ts` — NEW (Task 2)
- `src/hooks/use-grocery.ts` — NEW (Task 3)
- `src/components/recipes/recipe-detail.tsx` — MODIFY: wire up button (Task 4)
- `src/app/api/grocery/route.test.ts` — NEW (Task 5)
- `src/hooks/use-grocery.test.ts` — NEW (Task 5)
- `src/components/recipes/recipe-detail.test.tsx` — MODIFY: update button assertions (Task 5)

---

## Change Log

- 2026-03-22: Story 4.1 created — add recipe to grocery list
- 2026-03-22: Story 4.1 implemented — all tasks complete, 396 tests passing, status → review
- 2026-03-22: Code review patches applied — 408 tests passing, status → done
