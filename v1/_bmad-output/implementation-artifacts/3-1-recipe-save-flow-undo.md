# Story 3.1: Recipe Save Flow & Undo

**Status:** done
**Story ID:** 3.1
**Epic:** 3 — Recipe Save & Collection

---

## Story

As a user who has reviewed a dish result,
I want to save the recipe with one tap and undo immediately if needed,
So that I capture the moment without permanently committing if I made a mistake.

---

## Acceptance Criteria

**Given** the dish detail bottom sheet is open
**When** the user taps "Save Recipe"
**Then** the recipe is immediately saved to Supabase; the bottom sheet dismisses; a sonner toast appears for 4 seconds reading "Recipe saved" with an "Undo" action button

**Given** the undo toast is visible within 4 seconds
**When** the user taps "Undo"
**Then** the recipe and its `recipe_ingredients` rows are deleted from Supabase; the toast updates to "Recipe removed"; the `['recipes']` TanStack Query cache is invalidated; no partial state remains

**Given** a valid recipe payload is sent to `POST /api/recipes`
**When** the route processes it
**Then** it inserts one row into `recipes` and N rows into `recipe_ingredients`; it returns `{ data: { id, name, createdAt, servingSize, restaurantId } }` with HTTP 200

**Given** the recipe is saved from a scan result
**When** the POST payload is constructed
**Then** it includes: `name`, `dishImageUrl` (external URL or null), `confidenceMetadata` (from `confidence_metadata_json`), `servingSize` (default: 1), and `ingredients` array; no binary image data is included (NFR07)

**Given** the undo window expires (4 seconds pass) without undo action
**When** the toast disappears
**Then** the recipe record remains in Supabase; no further undo is possible; the recipe appears in the collection

---

## Tasks / Subtasks

- [x] Task 0: Schema migration — add macro columns to `recipe_ingredients`
  - [x] Run migration SQL in Supabase SQL Editor (see Dev Notes for exact SQL) ⚠️ MANUAL STEP — must be run in Supabase dashboard before deploying
  - [x] Update `supabase/schema.sql` to include macro columns
  - [x] Update `src/types/database.ts` — add macro columns to `recipe_ingredients` Row/Insert/Update
  - [x] Update `src/types/domain.ts` — add macro fields to `DomainIngredient` (all nullable)
  - [x] Add `RecipeSaveRequest` and `RecipeSaveResponse` types to `src/types/api.ts`

- [x] Task 1: Create `src/app/api/recipes/route.ts` — GET (stub) + POST create
  - [x] `POST /api/recipes`: validate payload, insert `recipes` row, insert N `recipe_ingredients` rows (macro columns all null), return `{ data: RecipeSaveResponse }`
  - [x] `GET /api/recipes`: return `{ data: [] }` stub — Story 3.2 will implement the full list
  - [x] Import `supabase` from `@/lib/supabase` — never instantiate inline
  - [x] No `getApiKeys()` call — no external APIs in this route
  - [x] On validation failure: `{ error: string, code: 'VALIDATION_ERROR' }` HTTP 422
  - [x] On DB error: `{ error: 'Failed to save recipe', code: 'DB_ERROR' }` HTTP 500

- [x] Task 2: Create `src/app/api/recipes/[id]/route.ts` — DELETE
  - [x] `DELETE /api/recipes/[id]`: delete from `recipes` WHERE id matches — cascade handles `recipe_ingredients` automatically (ON DELETE CASCADE in schema)
  - [x] Return `{ data: { deleted: true } }` with HTTP 200
  - [x] If not found: `{ error: 'Recipe not found', code: 'NOT_FOUND' }` HTTP 404
  - [x] `GET /api/recipes/[id]` stub: return 501 Not Implemented — Story 3.3 will implement
  - [x] `PUT /api/recipes/[id]` stub: return 501 Not Implemented — Story 3.4 will implement

- [x] Task 3: Create `src/hooks/use-recipes.ts` — `useSaveRecipe` + `useDeleteRecipe`
  - [x] `useSaveRecipe()`: `useMutation` → POST `/api/recipes` → on success: `qc.invalidateQueries({ queryKey: ['recipes'] })`
  - [x] `useDeleteRecipe()`: `useMutation` → DELETE `/api/recipes/${id}` → on success: `qc.invalidateQueries({ queryKey: ['recipes'] })`
  - [x] Both hooks: throw on non-OK response (parse `json.error`)
  - [x] Do NOT add `onError` toast here — caller (scan-results.tsx) handles error UX

- [x] Task 4: Update `src/components/scan/dish-detail-sheet.tsx` — wire Save Recipe CTA
  - [x] Add `onSave?: (dish: DishResult) => void` to `DishDetailSheetProps`
  - [x] Save Recipe button: `onClick={() => { onSave?.(dish); onClose() }}` (dismiss sheet immediately, mutation fires in parent)
  - [x] Remove `useRouter` import and usage (no longer needed — "See Full Details" uses `<Link>`)
  - [x] Do NOT change the "See Full Details" `<Link href={detailUrl}>` — leave as-is

- [x] Task 5: Update `src/components/scan/scan-results.tsx` — save + undo toast
  - [x] Import `useSaveRecipe`, `useDeleteRecipe` from `@/hooks/use-recipes`
  - [x] Import `toast` from `sonner`
  - [x] Import `RecipeSaveRequest` from `@/types/api`
  - [x] Add `handleSaveRecipe(dish: DishResult)` function (see Dev Notes for implementation)
  - [x] Pass `onSave={handleSaveRecipe}` to `<DishDetailSheet>`
  - [x] On save success: show sonner toast with 4s undo action
  - [x] `handleUndo(recipeId)`: call `deleteMutation.mutateAsync(recipeId)` → `toast('Recipe removed')`
  - [x] On save error: `toast.error('Failed to save recipe')` (do not dismiss)

- [x] Task 6: Write tests
  - [x] `src/app/api/recipes/route.test.ts` (NEW) — see Dev Notes
  - [x] `src/app/api/recipes/[id]/route.test.ts` (NEW) — see Dev Notes
  - [x] `src/hooks/use-recipes.test.ts` (NEW) — see Dev Notes
  - [x] `src/components/scan/dish-detail-sheet.test.tsx` — update existing: test `onSave` called on button click
  - [x] `src/components/scan/scan-results.test.tsx` — update existing: test save flow + toast

---

## Dev Notes

### ⚠️ Open Action Items from Epic 2 Retrospective (MUST follow)

**Action 3 (Quinn/QA):** Name-keyed matching flagged as an explicit named risk for Story 3.1.

> When inserting `recipe_ingredients`, iterate over the `ingredients` array by name — not by index. If you need to correlate ingredients back to a dish result for any reason (e.g., enrichment), always key by `ingredient.name`, never by array position. Gemini does not guarantee stable ordering across calls.

This applies to: constructing the DB insert payload, building the `RecipeSaveRequest`, and any future merge/update operations on ingredients.

---

### File Locations

```
src/
  app/
    api/
      recipes/
        route.ts                       ← NEW (Task 1)
        route.test.ts                  ← NEW (Task 6)
        [id]/
          route.ts                     ← NEW (Task 2)
          route.test.ts                ← NEW (Task 6)
  hooks/
    use-recipes.ts                     ← NEW (Task 3)
    use-recipes.test.ts                ← NEW (Task 6)
  components/
    scan/
      dish-detail-sheet.tsx            ← MODIFY (Task 4)
      dish-detail-sheet.test.tsx       ← MODIFY (Task 6)
      scan-results.tsx                 ← MODIFY (Task 5)
      scan-results.test.tsx            ← MODIFY (Task 6)
  types/
    api.ts                             ← MODIFY (Task 0)
    database.ts                        ← MODIFY (Task 0)
    domain.ts                          ← MODIFY (Task 0)
supabase/
  schema.sql                           ← MODIFY (Task 0)
```

---

### What Already Exists (do NOT recreate or modify)

- **`DishDetailSheet`** at `src/components/scan/dish-detail-sheet.tsx` — feature-complete; add `onSave` prop only; do not touch EvidenceBlock, image rendering, or the "See Full Details" link
- **`scan-results.tsx` DishDetailSheet usage** (lines 121–127): passes `dish`, `open`, `onClose`, `scanId`, `dishIndex` — add `onSave={handleSaveRecipe}` alongside existing props; do not restructure
- **`recipes` table schema**: already exists in Supabase; do NOT recreate it — only add macro columns to `recipe_ingredients`
- **`recipe_ingredients.ON DELETE CASCADE`**: already in schema.sql (line 41: `recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE`) — DELETE from `recipes` automatically deletes all matching ingredients; no manual cascade needed
- **`supabase` singleton**: `src/lib/supabase.ts` — import from `@/lib/supabase`; never instantiate a Supabase client inline (architecture anti-pattern)
- **`sonner` toast library**: already installed; import `toast` from `'sonner'`
- **All glass UI components** (GlassCard, BottomSheet, ProcessingStrip, ErrorState): feature-complete; do not modify
- **`use-scan.ts`**: feature-complete; do not modify

---

### Task 0: Schema Migration SQL

Run this in Supabase SQL Editor. Also update `supabase/schema.sql` to match.

```sql
-- Add nutritional macro columns to recipe_ingredients (nullable — Story 3.6 populates them at save time)
ALTER TABLE recipe_ingredients
  ADD COLUMN calories_kcal NUMERIC,
  ADD COLUMN protein_g     NUMERIC,
  ADD COLUMN fat_g         NUMERIC,
  ADD COLUMN carbs_g       NUMERIC;
```

Update `supabase/schema.sql` `recipe_ingredients` table definition to:

```sql
CREATE TABLE recipe_ingredients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  quantity         TEXT,
  unit             TEXT,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('high', 'medium', 'low')),
  calories_kcal    NUMERIC,     -- Story 3.6: USDA macro at save time (null until then)
  protein_g        NUMERIC,
  fat_g            NUMERIC,
  carbs_g          NUMERIC
);
```

---

### Task 0: Type Updates

**`src/types/database.ts`** — update `recipe_ingredients` Row/Insert/Update to include macro columns:

```typescript
recipe_ingredients: {
  Row: {
    id: string
    recipe_id: string
    name: string
    quantity: string | null
    unit: string | null
    confidence_level: 'high' | 'medium' | 'low'
    calories_kcal: number | null   // NEW
    protein_g: number | null       // NEW
    fat_g: number | null           // NEW
    carbs_g: number | null         // NEW
  }
  Insert: {
    id?: string
    recipe_id: string
    name: string
    quantity?: string | null
    unit?: string | null
    confidence_level: 'high' | 'medium' | 'low'
    calories_kcal?: number | null  // NEW
    protein_g?: number | null      // NEW
    fat_g?: number | null          // NEW
    carbs_g?: number | null        // NEW
  }
  // Update: same as Insert (all optional)
}
```

**`src/types/domain.ts`** — update `DomainIngredient` to include macro fields:

```typescript
export interface DomainIngredient {
  id: string
  recipeId: string
  name: string
  quantity: string | null
  unit: string | null
  confidenceLevel: 'high' | 'medium' | 'low'
  caloriesKcal: number | null   // NEW — null until Story 3.6 populates
  proteinG: number | null       // NEW
  fatG: number | null           // NEW
  carbsG: number | null         // NEW
}
```

**`src/types/api.ts`** — add recipe types (append after existing types):

```typescript
// ─── Recipe API ───────────────────────────────────────────────────────────────

export interface RecipeSaveRequest {
  name: string
  dishImageUrl: string | null
  confidenceMetadata: Record<string, unknown> | null
  servingSize: number
  ingredients: IngredientResult[]  // reuse existing IngredientResult — same shape
}

export interface RecipeSaveResponse {
  id: string
  name: string
  createdAt: string
  servingSize: number
  restaurantId: string | null
}
```

---

### Task 1: `POST /api/recipes` route

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { RecipeSaveRequest, RecipeSaveResponse } from '@/types/api'

export async function POST(req: NextRequest) {
  const body = await req.json() as RecipeSaveRequest

  // Validate required fields
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required', code: 'VALIDATION_ERROR' }, { status: 422 })
  }
  if (!Array.isArray(body.ingredients)) {
    return NextResponse.json({ error: 'ingredients must be an array', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  // Insert recipe row
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      name: body.name.trim(),
      dish_image_url: body.dishImageUrl ?? null,
      confidence_metadata_json: body.confidenceMetadata ?? null,
      serving_size: body.servingSize ?? 1,
    })
    .select('id, name, restaurant_id, serving_size, created_at')
    .single()

  if (recipeError || !recipe) {
    return NextResponse.json({ error: 'Failed to save recipe', code: 'DB_ERROR' }, { status: 500 })
  }

  // Insert ingredients — keyed by name (never by index — see Epic 2 Retro Action 3)
  if (body.ingredients.length > 0) {
    const ingredientRows = body.ingredients.map(ing => ({
      recipe_id: recipe.id,
      name: ing.name,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      confidence_level: ing.confidenceLevel,
      calories_kcal: null,  // Story 3.6 will populate at save time
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    }))

    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(ingredientRows)

    if (ingError) {
      // Roll back the recipe row — maintain atomicity
      await supabase.from('recipes').delete().eq('id', recipe.id)
      return NextResponse.json({ error: 'Failed to save recipe ingredients', code: 'DB_ERROR' }, { status: 500 })
    }
  }

  const response: RecipeSaveResponse = {
    id: recipe.id,
    name: recipe.name,
    createdAt: recipe.created_at,
    servingSize: recipe.serving_size,
    restaurantId: recipe.restaurant_id,
  }

  return NextResponse.json({ data: response })
}

export async function GET() {
  // Story 3.2 will implement recipe list — stub returns empty array
  return NextResponse.json({ data: [] })
}
```

---

### Task 2: `DELETE /api/recipes/[id]` route

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params

  const { error, count } = await supabase
    .from('recipes')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete recipe', code: 'DB_ERROR' }, { status: 500 })
  }
  if (count === 0) {
    return NextResponse.json({ error: 'Recipe not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // recipe_ingredients are deleted automatically via ON DELETE CASCADE
  return NextResponse.json({ data: { deleted: true } })
}

export async function GET() {
  return NextResponse.json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' }, { status: 501 })
}

export async function PUT() {
  return NextResponse.json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' }, { status: 501 })
}
```

---

### Task 3: `use-recipes.ts` hook

```typescript
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RecipeSaveRequest, RecipeSaveResponse, ApiSuccess } from '@/types/api'

export function useSaveRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RecipeSaveRequest): Promise<ApiSuccess<RecipeSaveResponse>> => {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save recipe')
      return json as ApiSuccess<RecipeSaveResponse>
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (recipeId: string): Promise<void> => {
      const res = await fetch(`/api/recipes/${recipeId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to delete recipe')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}
```

---

### Task 4: `dish-detail-sheet.tsx` changes

**Add `onSave` to props interface:**
```typescript
interface DishDetailSheetProps {
  dish: DishResult | null
  open: boolean
  onClose: () => void
  scanId: string
  dishIndex: number
  onSave?: (dish: DishResult) => void  // NEW
}
```

**Update destructure and Save Recipe button:**
```typescript
// Destructure
export function DishDetailSheet({ dish, open, onClose, scanId, dishIndex, onSave }: DishDetailSheetProps) {
  // Remove: const router = useRouter()
  // Remove: import { useRouter } from 'next/navigation'
```

**Replace the Save Recipe button onClick** (currently `onClick={() => router.push(detailUrl)}`):
```typescript
<button
  onClick={() => { onSave?.(dish); onClose() }}
  ...
>
  Save Recipe
</button>
```

`<Link href={detailUrl}>See Full Details</Link>` — no change.

---

### Task 5: `scan-results.tsx` changes

Add to imports:
```typescript
import { useSaveRecipe, useDeleteRecipe } from '@/hooks/use-recipes'
import { toast } from 'sonner'
import type { RecipeSaveRequest } from '@/types/api'
```

Add mutation hooks inside `ScanResults` component (alongside existing `useQuery`):
```typescript
const saveMutation = useSaveRecipe()
const deleteMutation = useDeleteRecipe()
```

Add handler function:
```typescript
const handleSaveRecipe = async (dish: DishResult) => {
  const payload: RecipeSaveRequest = {
    name: dish.name,
    dishImageUrl: dish.imageUrl,
    confidenceMetadata: { confidenceSource: activeResult.confidenceSource },
    servingSize: 1,
    ingredients: dish.ingredients,
  }

  try {
    const result = await saveMutation.mutateAsync(payload)
    const savedId = result.data.id

    // Show 4-second undo toast
    toast('Recipe saved', {
      duration: 4000,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await deleteMutation.mutateAsync(savedId)
            toast('Recipe removed')
          } catch {
            toast.error('Could not undo — recipe may already be saved')
          }
        },
      },
    })
  } catch {
    toast.error('Failed to save recipe')
  }
}
```

Pass to DishDetailSheet — add `onSave={handleSaveRecipe}` to the existing prop spread:
```typescript
<DishDetailSheet
  dish={selectedDish}
  open={selectedDish !== null}
  onClose={() => setSelectedDishIndex(null)}
  scanId={scanId}
  dishIndex={selectedDishIndex ?? 0}
  onSave={handleSaveRecipe}   // NEW
/>
```

---

### Task 6: Test Guidance

**Test pattern from Epic 2 — reuse these mocks (already established):**
- `framer-motion` mock: `{ motion: { div: ... }, useReducedMotion, AnimatePresence, useDragControls }`
- `focus-trap-react` mock: `{ default: ({ children }) => children }`
- `next/navigation` mock: `{ useRouter, useSearchParams, usePathname }`
- `next/link` mock: renders as `<a href={href}>`
- Supabase mock: `vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))`

**`src/app/api/recipes/route.test.ts`:**
```typescript
// Cases to cover:
// - POST success: valid payload → 200 with { data: { id, name, createdAt, servingSize, restaurantId } }
// - POST success zero ingredients: valid payload with [] → 200 (skip ingredient insert)
// - POST missing name: → 422 { error, code: 'VALIDATION_ERROR' }
// - POST DB error on recipes insert: → 500 { error, code: 'DB_ERROR' }
// - POST DB error on ingredients insert: rolls back recipe row → 500
// - GET: → 200 { data: [] }
```

**`src/app/api/recipes/[id]/route.test.ts`:**
```typescript
// Cases to cover:
// - DELETE success: count 1 → 200 { data: { deleted: true } }
// - DELETE not found: count 0 → 404 { error, code: 'NOT_FOUND' }
// - DELETE DB error: → 500 { error, code: 'DB_ERROR' }
// - GET: → 501 { error, code: 'NOT_IMPLEMENTED' }
// - PUT: → 501 { error, code: 'NOT_IMPLEMENTED' }
```

**`src/hooks/use-recipes.test.ts`:**
```typescript
// useSaveRecipe:
// - fires POST /api/recipes with JSON payload
// - on success: invalidates ['recipes'] query key
// - on 422 error: throws with error message from response
// useDeleteRecipe:
// - fires DELETE /api/recipes/{id}
// - on success: invalidates ['recipes'] query key
// - on non-ok: throws
```

**`dish-detail-sheet.test.tsx` updates:**
```typescript
// - 'onSave is called when Save Recipe button is clicked': render with onSave mock, click button, expect mock called with dish
// - 'onClose is called when Save Recipe button is clicked': same render, click, expect onClose called
// - 'Save Recipe no longer triggers navigation': router.push NOT called when onSave prop provided
```

**`scan-results.test.tsx` updates:**
```typescript
// - 'shows "Recipe saved" toast with undo action after save': mock useSaveRecipe success, open sheet, click Save, expect toast
// - 'undo calls delete mutation and shows "Recipe removed" toast': mock both mutations, save, click Undo
// - 'shows error toast when save fails': mock useSaveRecipe to reject, click Save, expect error toast
// Note: mock 'sonner' via vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))
```

---

### Architecture Compliance

| Rule | Application |
|------|-------------|
| `{ data: T }` / `{ error, code }` response shapes | Both routes return only these shapes |
| `supabase` from `@/lib/supabase` | Both routes import from singleton |
| No `getApiKeys()` — no external APIs | Recipe CRUD has no external API calls |
| TanStack Query keys: `['recipes']`, `['recipes', recipeId]` | `invalidateQueries` uses `['recipes']` |
| camelCase TypeScript, snake_case DB | `RecipeSaveResponse` camelCase; DB inserts use snake_case |
| Three-layer error handling | Route returns error shape; hook throws; scan-results.tsx shows toast |
| No binary image data (NFR07) | `dishImageUrl` is string or null — external URL only |
| `'use client'` on hooks | Both hooks marked `'use client'` |

---

### Critical: Do NOT Break

- **`DishDetailSheet` "See Full Details" link** — must remain working; `<Link href={detailUrl}>` unchanged
- **`scan-results.tsx` dish list rendering** — `DishCard` and `EmptyScanState` unchanged; only `handleSaveRecipe` and `DishDetailSheet` call site modified
- **`scan-results.tsx` retake / partial results banner** — no changes to `handleRetake`, the partial results banner, or the `EmptyScanState` component
- **Enrichment flow** (`use-scan.ts`, `fireEnrichment`) — not touched; confidence source in `activeResult` is still correct when save fires
- **Test mocks established in Epic 2** — reuse without redeclaring; do not change framer-motion or focus-trap mocks

---

### Epic 3 Context for Developer

This story introduces the first Epic 3 write path. Subsequent stories build on it:
- **Story 3.2** implements `GET /api/recipes` (currently stub) and the populated home screen
- **Story 3.3** implements `GET /api/recipes/[id]` (currently 501) and the recipe detail page
- **Story 3.4** implements `PUT /api/recipes/[id]` (currently 501) and recipe editing
- **Story 3.6** adds USDA nutritional data at save time — it extends `POST /api/recipes` to populate the macro columns this story leaves as null

The schema macro columns must be null-safe from day one — Story 3.6 will be additive, not a rewrite.

---

## Dev Agent Record

### Implementation Plan

Followed tasks 0–6 in sequence with red-green-refactor cycles for each testable task.

- **Task 0**: Type-only changes — schema.sql, database.ts, domain.ts, api.ts updated with macro columns and recipe types. Supabase migration SQL must be run manually in dashboard.
- **Task 1**: POST /api/recipes — validates name and ingredients array, inserts recipe then ingredients atomically (rolls back recipe row if ingredient insert fails). GET stub returns `{ data: [] }`.
- **Task 2**: DELETE /api/recipes/[id] with exact count to distinguish 404 vs 200. GET and PUT stubs return 501. Cascade handles ingredient deletion automatically.
- **Task 3**: useSaveRecipe and useDeleteRecipe hooks using TanStack Query useMutation. Both invalidate `['recipes']` query key on success. Error handling delegated to caller.
- **Task 4**: Removed `useRouter` from dish-detail-sheet.tsx. Added `onSave?` prop. Save Recipe button now calls `onSave?.(dish); onClose()`.
- **Task 5**: Added save/delete mutations and `handleSaveRecipe` to scan-results.tsx. Toast with 4s duration and Undo action. Undo calls delete mutation then shows "Recipe removed" toast.
- **Task 6**: Tests written with vi.hoisted() for mock variables to avoid hoisting issues. All 244 tests pass.

### Completion Notes

- ✅ All 7 tasks (0–6) complete, all subtasks checked
- ✅ 244 tests passing, 0 failing, 0 regressions
- ✅ 24 new tests added (7 route, 5 [id] route, 6 hook, 3 dish-detail-sheet, 3 scan-results)
- ✅ Name-keyed ingredient insert (Epic 2 Retro Action 3 applied)
- ✅ Atomic rollback if ingredient insert fails after recipe row created
- ⚠️ Supabase migration SQL (Task 0, subtask 1) requires manual run in Supabase SQL Editor before deploying

---

## File List

- `supabase/schema.sql` — modified: added macro columns to recipe_ingredients
- `src/types/database.ts` — modified: added macro columns to recipe_ingredients Row/Insert/Update
- `src/types/domain.ts` — modified: added macro fields to DomainIngredient
- `src/types/api.ts` — modified: added RecipeSaveRequest and RecipeSaveResponse types
- `src/app/api/recipes/route.ts` — new: POST create + GET stub
- `src/app/api/recipes/route.test.ts` — new: 7 tests
- `src/app/api/recipes/[id]/route.ts` — new: DELETE + GET/PUT stubs
- `src/app/api/recipes/[id]/route.test.ts` — new: 5 tests
- `src/hooks/use-recipes.ts` — new: useSaveRecipe + useDeleteRecipe hooks
- `src/hooks/use-recipes.test.ts` — new: 6 tests
- `src/components/scan/dish-detail-sheet.tsx` — modified: removed useRouter, added onSave prop
- `src/components/scan/dish-detail-sheet.test.tsx` — modified: updated + 3 new tests
- `src/components/scan/scan-results.tsx` — modified: added save/undo flow
- `src/components/scan/scan-results.test.tsx` — modified: updated + 3 new tests

---

## Change Log

- 2026-03-22: Implemented Story 3.1 — recipe save flow with undo toast, API routes, hooks, and type updates
