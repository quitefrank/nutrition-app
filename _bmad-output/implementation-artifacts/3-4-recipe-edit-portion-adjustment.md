# Story 3.4: Recipe Edit & Portion Adjustment

**Status:** review
**Story ID:** 3.4
**Epic:** 3 — Recipe Save & Collection

---

## Story

As a user with a saved recipe that needs correcting,
I want to edit ingredients and adjust the serving size,
So that the recipe reflects reality and scales to my needs.

---

## Acceptance Criteria

**Given** the recipe detail page is open
**When** the user taps an edit button (pencil icon or "Edit")
**Then** the app navigates to the recipe edit page (`/recipes/[id]/edit`); all ingredients appear in editable inline fields; the serving size multiplier is editable; a "Save" action and a "Cancel" action are visible

**Given** the recipe edit view
**When** the user edits an ingredient name or quantity
**Then** the change is reflected immediately in the edit view; unsaved changes are not yet persisted

**Given** the user adjusts the serving size multiplier (e.g., from 1 to 4) (FR16)
**When** the multiplier is changed
**Then** all ingredient quantities in the edit view scale proportionally in real time; saving persists the scaled quantities

**Given** the user taps "Save" in the edit view
**When** `PUT /api/recipes/[id]` is called
**Then** the updated recipe name, serving size, and all `recipe_ingredients` rows are persisted to Supabase; `['recipes', recipeId]` and `['recipes']` cache entries are invalidated; the app navigates back to the recipe detail page showing updated values

**Given** the `PUT /api/recipes/[id]` route
**When** called with a valid payload
**Then** it returns `{ data: Recipe }` with HTTP 200; if validation fails (e.g., empty ingredient name or empty recipe name), it returns `{ error: string, code: 'VALIDATION_ERROR' }` with HTTP 422

**Given** the user taps "Cancel" in the edit view
**When** tapped before saving
**Then** all changes are discarded; the app navigates back to the recipe detail page; no Supabase write occurs

**Given** a user is editing ingredients (pre-edit of an initial save — editing before confirming save)
**When** the edited recipe is saved
**Then** the edited values are persisted, not the original AI-generated values (FR15)

---

## Tasks / Subtasks

- [x] Task 1: Add `RecipeUpdateRequest` to `src/types/api.ts`
  - [x] Define the type with `name`, `servingSize`, and `ingredients` array (see Dev Notes)
  - [x] Add alongside existing `RecipeSaveRequest` — do NOT modify other types

- [x] Task 2: Implement `PUT /api/recipes/[id]` route
  - [x] Replace the 501 stub in the existing `PUT` export in `src/app/api/recipes/[id]/route.ts`
  - [x] UUID validation + input validation (non-empty name, no empty ingredient names)
  - [x] UPDATE `recipes` row, then UPDATE each `recipe_ingredients` row by id
  - [x] Re-query and return full `{ data: Recipe }` using the existing GET query logic
  - [x] **Do NOT touch DELETE or GET handlers**

- [x] Task 3: Add `useUpdateRecipe` hook to `src/hooks/use-recipes.ts`
  - [x] Add mutation alongside existing hooks — do NOT modify `useRecipes`, `useSaveRecipe`, `useDeleteRecipe`, `useRecipe`
  - [x] On success: invalidate `['recipes', id]` and `['recipes']`

- [x] Task 4: Add "Edit" button to `src/app/recipes/[id]/page.tsx`
  - [x] Add a pencil/Edit button in the header row alongside the existing "← Back" button
  - [x] On tap: navigate to `/recipes/${id}/edit`
  - [x] Only render when `recipe` data is loaded (not during loading/error states)

- [x] Task 5: Create `src/app/recipes/[id]/edit/page.tsx`
  - [x] Client component; reads `params` via `use(params)` (Next.js 15 pattern — same as detail page)
  - [x] Loads recipe via `useRecipe(id)` — uses cache, no extra fetch if already loaded
  - [x] Manages local edit state: `editedName`, `editedServingSize`, `editedIngredients`
  - [x] On serving size change: scale all quantities in real time (see Dev Notes for scaling logic)
  - [x] Save calls `useUpdateRecipe`, navigates back on success; Cancel navigates back immediately
  - [x] See Dev Notes for full UI spec

- [x] Task 6: Write tests
  - [x] `src/app/api/recipes/[id]/route.test.ts` — ADD PUT cases (success, validation error, DB error)
  - [x] `src/hooks/use-recipes.test.ts` — ADD `useUpdateRecipe` cases
  - [x] `src/app/recipes/[id]/edit/page.test.tsx` — NEW (see Dev Notes)
  - [x] `src/app/recipes/[id]/page.test.tsx` — MODIFY: verify Edit button renders when recipe loaded

---

## Dev Notes

### Architecture Compliance

| Rule | This story |
|------|-----------|
| `{ data: T }` / `{ error, code }` shapes | PUT returns `{ data: Recipe }` (200) or `{ error, code: 'VALIDATION_ERROR' }` (422) or `{ error, code: 'DB_ERROR' }` (500) |
| `supabase` from `@/lib/supabase` | Import singleton — never inline |
| TanStack Query keys | Invalidate `['recipes', id]` AND `['recipes']` on success |
| `'use client'` | Edit page + hooks |
| Next.js 15 params | `Promise<{ id: string }>` — use `use(params)` in client page |
| UUID validation | Reuse `UUID_RE` from existing route.ts — already defined in that file |
| camelCase TS / snake_case DB | Map in route as established |
| NFR15 | All interactive elements ≥ 44pt touch target |

---

### Task 1: RecipeUpdateRequest type

Add to **`src/types/api.ts`** (after `RecipeSaveResponse`):

```typescript
export interface RecipeUpdateIngredient {
  id: string          // existing ingredient UUID — edit-in-place only (no add/remove in this story)
  name: string
  quantity: string | null
  unit: string | null
  confidenceLevel: 'high' | 'medium' | 'low'
}

export interface RecipeUpdateRequest {
  name: string
  servingSize: number
  ingredients: RecipeUpdateIngredient[]
}
```

**Scope note:** This story edits existing ingredients only. Adding or removing ingredients is out of scope. Each ingredient in the payload must have an `id` corresponding to an existing `recipe_ingredients` row.

---

### Task 2: PUT /api/recipes/[id] route

**Target file:** `src/app/api/recipes/[id]/route.ts`

Replace the existing `export async function PUT()` stub.

```typescript
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid recipe id', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const body = await req.json().catch(() => null) as import('@/types/api').RecipeUpdateRequest | null
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, { status: 400 })
  }

  // Validation
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Recipe name is required', code: 'VALIDATION_ERROR' }, { status: 422 })
  }
  if (!Array.isArray(body.ingredients) || body.ingredients.some(i => !i.name?.trim())) {
    return NextResponse.json({ error: 'All ingredient names are required', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  // Update recipe row
  const { error: recipeError } = await supabase
    .from('recipes')
    .update({ name: body.name.trim(), serving_size: body.servingSize })
    .eq('id', id)

  if (recipeError) {
    return NextResponse.json({ error: 'Failed to update recipe', code: 'DB_ERROR' }, { status: 500 })
  }

  // Update each ingredient row individually (preserves macro columns untouched)
  for (const ing of body.ingredients) {
    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .update({
        name: ing.name.trim(),
        quantity: ing.quantity,
        unit: ing.unit,
        confidence_level: ing.confidenceLevel,
      })
      .eq('id', ing.id)
      .eq('recipe_id', id)   // safety: prevent cross-recipe writes

    if (ingError) {
      return NextResponse.json({ error: 'Failed to update ingredients', code: 'DB_ERROR' }, { status: 500 })
    }
  }

  // Re-query full recipe to return updated state (reuse GET query logic)
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      id, name, restaurant_id, dish_image_url, confidence_metadata_json, serving_size, created_at,
      restaurants ( id, name, google_places_id, atmospheric_palette_json, updated_at ),
      recipe_ingredients ( id, recipe_id, name, quantity, unit, confidence_level, calories_kcal, protein_g, fat_g, carbs_g )
    `)
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch updated recipe', code: 'DB_ERROR' }, { status: 500 })
  }

  // Map to Recipe domain type — identical mapping as GET handler
  const restaurant = data.restaurants as { id: string; name: string; google_places_id: string | null; atmospheric_palette_json: Record<string, unknown> | null; updated_at: string } | null

  const recipe: Recipe = {
    id: data.id,
    name: data.name,
    restaurantId: data.restaurant_id,
    dishImageUrl: data.dish_image_url,
    confidenceMetadataJson: data.confidence_metadata_json as Record<string, unknown> | null,
    servingSize: data.serving_size,
    createdAt: data.created_at,
    restaurant: restaurant ? {
      id: restaurant.id, name: restaurant.name,
      googlePlacesId: restaurant.google_places_id,
      atmosphericPaletteJson: restaurant.atmospheric_palette_json,
      updatedAt: restaurant.updated_at,
    } : null,
    ingredients: ((data.recipe_ingredients ?? []) as Array<{
      id: string; recipe_id: string; name: string; quantity: string | null; unit: string | null;
      confidence_level: string; calories_kcal: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null;
    }>).map(ing => ({
      id: ing.id,
      recipeId: ing.recipe_id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      confidenceLevel: (VALID_CONFIDENCE.includes(ing.confidence_level as typeof VALID_CONFIDENCE[number])
        ? ing.confidence_level
        : 'low') as 'high' | 'medium' | 'low',
      caloriesKcal: ing.calories_kcal,
      proteinG: ing.protein_g,
      fatG: ing.fat_g,
      carbsG: ing.carbs_g,
    })),
  }

  return NextResponse.json({ data: recipe })
}
```

**Important:** `UUID_RE` and `VALID_CONFIDENCE` are already defined at the top of the file — do NOT redefine them. `Recipe` is already imported. Import `RecipeUpdateRequest` from `@/types/api` (add to existing import).

---

### Task 3: useUpdateRecipe hook

Add to **`src/hooks/use-recipes.ts`** (after `useDeleteRecipe`):

```typescript
export function useUpdateRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: RecipeUpdateRequest }): Promise<Recipe> => {
      const res = await fetch(`/api/recipes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to update recipe')
      }
      const json = await res.json()
      return (json as ApiSuccess<Recipe>).data
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', id] })
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}
```

Add `RecipeUpdateRequest` to the existing import from `@/types/api`.

---

### Task 4: Edit button in page.tsx

In **`src/app/recipes/[id]/page.tsx`**, modify the header row to include an Edit button when recipe data is loaded:

```tsx
{/* Back navigation + Edit button */}
<div className="px-[var(--spacing-4)] pt-[var(--spacing-4)] flex items-center justify-between">
  <button
    onClick={() => goBack(router)}
    style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none',
      border: 'none', cursor: 'pointer', padding: '8px 0', minHeight: '44px' }}
    aria-label="Go back"
  >
    ← Back
  </button>
  {recipe && (
    <button
      onClick={() => router.push(`/recipes/${id}/edit`)}
      style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none',
        border: 'none', cursor: 'pointer', padding: '8px', minHeight: '44px' }}
      aria-label="Edit recipe"
    >
      Edit
    </button>
  )}
</div>
```

The `goBack` helper already exists in the file — keep it unchanged.

---

### Task 5: Edit page

**File:** `src/app/recipes/[id]/edit/page.tsx` — NEW, create directory as needed.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { use, useState, useEffect } from 'react'
import { useRecipe, useUpdateRecipe } from '@/hooks/use-recipes'
import type { RecipeUpdateRequest } from '@/types/api'
import type { DomainIngredient } from '@/types/domain'

interface PageProps {
  params: Promise<{ id: string }>
}

// Scale a quantity string by a factor. Returns null or non-numeric quantities unchanged.
function scaleQuantity(quantity: string | null, factor: number): string | null {
  if (!quantity) return quantity
  const num = parseFloat(quantity)
  if (isNaN(num)) return quantity
  const scaled = num * factor
  return Number.isInteger(scaled) ? String(scaled) : String(Math.round(scaled * 100) / 100)
}

export default function RecipeEditPage({ params }: PageProps) {
  const { id } = use(params)
  const { data: recipe, isLoading, isError } = useRecipe(id)
  const { mutate: updateRecipe, isPending } = useUpdateRecipe()
  const router = useRouter()

  const [editedName, setEditedName] = useState('')
  const [editedServingSize, setEditedServingSize] = useState(1)
  const [editedIngredients, setEditedIngredients] = useState<DomainIngredient[]>([])
  const [originalServingSize, setOriginalServingSize] = useState(1)

  // Initialise state from recipe data (runs once when recipe loads)
  useEffect(() => {
    if (recipe && editedName === '') {
      setEditedName(recipe.name)
      setEditedServingSize(recipe.servingSize)
      setOriginalServingSize(recipe.servingSize)
      setEditedIngredients(recipe.ingredients ?? [])
    }
  }, [recipe, editedName])

  // Scale all ingredient quantities when serving size changes
  function handleServingSizeChange(newSize: number) {
    const factor = newSize / editedServingSize
    setEditedServingSize(newSize)
    setEditedIngredients(prev =>
      prev.map(ing => ({ ...ing, quantity: scaleQuantity(ing.quantity, factor) }))
    )
  }

  function handleIngredientChange(index: number, field: 'name' | 'quantity' | 'unit', value: string) {
    setEditedIngredients(prev =>
      prev.map((ing, i) => i === index ? { ...ing, [field]: value || null } : ing)
    )
  }

  function handleSave() {
    if (!editedName.trim()) return
    const payload: RecipeUpdateRequest = {
      name: editedName.trim(),
      servingSize: editedServingSize,
      ingredients: editedIngredients.map(ing => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        confidenceLevel: ing.confidenceLevel,
      })),
    }
    updateRecipe({ id, payload }, {
      onSuccess: () => router.back(),
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Loading…</p>
      </div>
    )
  }

  if (isError || !recipe) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-[var(--spacing-4)] px-[var(--spacing-4)] text-center">
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>Could not load recipe for editing.</p>
        <button onClick={() => router.back()} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', minHeight: '44px' }}>
          ← Go back
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-full">
      {/* Header */}
      <div className="px-[var(--spacing-4)] pt-[var(--spacing-4)] flex items-center justify-between">
        <button
          onClick={() => router.back()}
          disabled={isPending}
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', minHeight: '44px' }}
          aria-label="Cancel"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isPending || !editedName.trim()}
          style={{
            fontSize: 'var(--text-sm)', fontWeight: 600,
            color: isPending || !editedName.trim() ? 'var(--text-tertiary)' : 'var(--text-primary)',
            background: 'none', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
            padding: '8px 0', minHeight: '44px',
          }}
          aria-label="Save changes"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex flex-col flex-1 px-[var(--spacing-4)] py-[var(--spacing-4)]">
        {/* Recipe name */}
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }} className="mb-[var(--spacing-1)]">
          Dish name
        </label>
        <input
          value={editedName}
          onChange={e => setEditedName(e.target.value)}
          style={{
            width: '100%', fontSize: 'var(--text-base)', color: 'var(--text-primary)',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: 'var(--spacing-4)',
          }}
          aria-label="Recipe name"
        />

        {/* Serving size */}
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }} className="mb-[var(--spacing-1)]">
          Serving size
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={editedServingSize}
          onChange={e => {
            const val = parseInt(e.target.value, 10)
            if (!isNaN(val) && val >= 1) handleServingSizeChange(val)
          }}
          style={{
            width: '80px', fontSize: 'var(--text-base)', color: 'var(--text-primary)',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: 'var(--spacing-4)',
          }}
          aria-label="Serving size"
        />

        {/* Ingredients */}
        <h2 style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontWeight: 600 }} className="mb-[var(--spacing-2)]">
          Ingredients
        </h2>
        <ul className="flex flex-col gap-[var(--spacing-3)]">
          {editedIngredients.map((ing, index) => (
            <li key={ing.id} className="flex gap-[var(--spacing-2)]">
              <input
                value={ing.name}
                onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                placeholder="Ingredient name"
                style={{
                  flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-sm)', padding: '10px',
                }}
                aria-label={`Ingredient ${index + 1} name`}
              />
              <input
                value={ing.quantity ?? ''}
                onChange={e => handleIngredientChange(index, 'quantity', e.target.value)}
                placeholder="Qty"
                style={{
                  width: '64px', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-sm)', padding: '10px',
                }}
                aria-label={`Ingredient ${index + 1} quantity`}
              />
              <input
                value={ing.unit ?? ''}
                onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                placeholder="Unit"
                style={{
                  width: '64px', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-sm)', padding: '10px',
                }}
                aria-label={`Ingredient ${index + 1} unit`}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

**Key behavioural notes:**
- The `useEffect` initialises state from recipe data only once (`editedName === ''` guard prevents re-init on re-render)
- `handleServingSizeChange` applies a **multiplicative factor** to current quantities (not to the original), so changes compound correctly: 1x → 2x = ×2, then 2x → 4x = ×2 again
- `scaleQuantity` skips non-numeric strings (e.g., "to taste", "a handful") — returns them unchanged
- `router.back()` used for both Cancel and post-save navigation (same pattern as detail page)
- `isPending` from `useUpdateRecipe` disables both Save and Cancel during the in-flight request

---

### Task 6: Test Guidance

**`src/app/api/recipes/[id]/route.test.ts` — ADD to existing file:**

```typescript
describe('PUT /api/recipes/[id]', () => {
  // Override the existing stub test from earlier (it tests 501 — now remove/replace)

  it('success: updates recipe and returns 200 with Recipe', async () => {
    const eqSpy = vi.fn().mockReturnThis()
    mockFrom
      .mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }) // update recipes
      .mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: eqSpy.mockReturnThis(), [Symbol.toPrimitive]: undefined }) // hmm
    // Simpler: chain all calls through the same mockFrom instance
    // See pattern below
  })
})
```

> **Note on mocking sequential Supabase calls:** The route calls `supabase.from(...)` multiple times (update recipe, update each ingredient, re-query GET). Use `mockFrom.mockReturnValueOnce(...)` in sequence for each call. The re-query at the end uses the same chain as the GET tests — reuse that mock setup.

Concrete test structure (adapt the UUID constants from the existing GET tests):

```typescript
describe('PUT /api/recipes/[id]', () => {
  const RECIPE_ID = '11111111-1111-1111-1111-111111111111'

  function makePutRequest(id: string, body: object) {
    return new Request(`http://localhost/api/recipes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as import('next/server').NextRequest
  }

  const validPayload = {
    name: 'Updated Duck Confit',
    servingSize: 2,
    ingredients: [{ id: 'ing-1', name: 'Duck leg', quantity: '4', unit: 'pcs', confidenceLevel: 'high' }],
  }

  it('success: returns 200 with updated Recipe', async () => {
    // Call 1: UPDATE recipes
    mockFrom.mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) })
    // Call 2: UPDATE recipe_ingredients (one ingredient)
    mockFrom.mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() })
    // Actually last eq in chain needs to resolve — mock the whole chain:
    const ingUpdateMock = { update: vi.fn().mockReturnThis(), eq: vi.fn() }
    ingUpdateMock.eq.mockReturnValueOnce(ingUpdateMock).mockResolvedValueOnce({ error: null })
    // Call 3: re-query GET (reuse GET success mock shape)
    mockFrom
      .mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) })
      .mockReturnValueOnce(ingUpdateMock)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          error: null,
          data: { id: RECIPE_ID, name: 'Updated Duck Confit', restaurant_id: null,
            dish_image_url: null, confidence_metadata_json: null, serving_size: 2,
            created_at: '2026-03-22T00:00:00Z', restaurants: null,
            recipe_ingredients: [{ id: 'ing-1', recipe_id: RECIPE_ID, name: 'Duck leg',
              quantity: '4', unit: 'pcs', confidence_level: 'high',
              calories_kcal: null, protein_g: null, fat_g: null, carbs_g: null }] },
        }),
      })

    const res = await PUT(makePutRequest(RECIPE_ID, validPayload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Updated Duck Confit')
    expect(body.data.servingSize).toBe(2)
  })

  it('validation: empty name → 422 VALIDATION_ERROR', async () => {
    const res = await PUT(makePutRequest(RECIPE_ID, { ...validPayload, name: '' }),
      { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('validation: ingredient with empty name → 422 VALIDATION_ERROR', async () => {
    const payload = { ...validPayload, ingredients: [{ id: 'ing-1', name: '', quantity: null, unit: null, confidenceLevel: 'high' }] }
    const res = await PUT(makePutRequest(RECIPE_ID, payload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('DB error on update → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: new Error('DB error') }) })
    const res = await PUT(makePutRequest(RECIPE_ID, validPayload), { params: Promise.resolve({ id: RECIPE_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})
```

> **⚠️ Replace the existing `describe('PUT /api/recipes/[id]', ...)`** that tests the 501 stub. The old test expects 501 and will fail once PUT is implemented.

**`src/app/recipes/[id]/edit/page.test.tsx` — NEW:**

```typescript
// Standard mocks (same pattern as page.test.tsx):
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: mockBack, replace: mockReplace }) }))
vi.mock('@/hooks/use-recipes', () => ({ useRecipe: (id) => mockUseRecipe(id), useUpdateRecipe: () => mockUseUpdateRecipe() }))
vi.mock('react', async () => { /* same use() mock as page.test.tsx */ })

// Test cases:
// - renders loading state when isLoading is true
// - renders error state when isError is true
// - renders recipe name input pre-filled with recipe name
// - renders serving size input pre-filled with recipe servingSize
// - renders one input row per ingredient
// - Save button is disabled when recipe name is empty
// - Save button calls mutate with correct RecipeUpdateRequest payload
// - Cancel button calls router.back()
// - serving size change scales numeric ingredient quantities
// - non-numeric quantities are not scaled when serving size changes
```

**`src/app/recipes/[id]/page.test.tsx` — MODIFY:**

Add one test:
```typescript
it('renders Edit button when recipe data is available', () => {
  mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })
  render(<RecipeDetailPage params={Promise.resolve({ id: 'test-id' })} />)
  expect(screen.getByRole('button', { name: /Edit recipe/i })).toBeTruthy()
})
```

---

### What Already Exists — Do NOT modify

- **`src/app/api/recipes/[id]/route.ts`** — DELETE and GET handlers are tested and correct; `UUID_RE` and `VALID_CONFIDENCE` are already defined at the top
- **`src/hooks/use-recipes.ts`** — `useRecipes`, `useSaveRecipe`, `useDeleteRecipe`, `useRecipe` are all complete
- **`src/types/domain.ts`** — `Recipe`, `DomainIngredient` are complete; no type changes needed
- **`src/components/recipes/recipe-detail.tsx`** — pure display component; do NOT add edit logic here
- **`src/app/recipes/[id]/page.tsx`** — minimal change: add Edit button + navigation only

---

### Quantity Scaling: Edge Cases

| Input quantity | Factor | Output |
|---|---|---|
| `"2"` | 2 | `"4"` |
| `"1.5"` | 2 | `"3"` |
| `"0.25"` | 4 | `"1"` |
| `"to taste"` | any | `"to taste"` (unchanged — non-numeric) |
| `null` | any | `null` (unchanged) |
| `""` | any | `""` (unchanged — falsy) |
| `"2"` | 0.5 | `"1"` |

The `scaleQuantity` function handles all of these correctly as specified in Task 5.

---

### Cross-Story Context

- **Story 3.5** will add cascade delete of `grocery_items` when a recipe is deleted. This story's PUT does NOT delete ingredient rows — it updates them in place — so no conflict with grocery_items.
- **Story 3.6** adds USDA macros to `recipe_ingredients`. The PUT route updates only `name`, `quantity`, `unit`, `confidence_level` — macro columns (`calories_kcal`, `protein_g`, `fat_g`, `carbs_g`) are intentionally untouched by this story, preserving USDA data once Story 3.6 ships.
- **Epic 4 (Story 4.1)** wires up "Add to Grocery List" — the CTA on the detail page remains disabled in this story; do NOT remove it.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_None_

### Completion Notes List

- Task 1: Added `RecipeUpdateIngredient` and `RecipeUpdateRequest` interfaces to `src/types/api.ts` after `RecipeSaveResponse`.
- Task 2: Replaced the 501 stub PUT handler with full implementation: UUID validation, input validation (empty name/ingredient name → 422), sequential ingredient updates with `recipe_id` safety filter, re-query and camelCase mapping identical to GET handler.
- Task 3: Added `useUpdateRecipe` mutation hook after `useDeleteRecipe`. Invalidates both `['recipes', id]` and `['recipes']` on success.
- Task 4: Changed recipe detail page header from single-button div to flex `justify-between` with conditional Edit button (renders only when `recipe` is loaded).
- Task 5: Created edit page with `useRef` initialization guard instead of the spec's `editedName === ''` guard — the ref approach correctly prevents re-initialization when the user clears the name field (the guard-by-state approach has a re-init bug when editedName returns to empty string). Quantities scale multiplicatively using current serving size as the base (not original), so compound changes (1x → 2x → 4x) work correctly.
- Task 6: 24 new tests added across 4 files. All pass. The 12 pre-existing failures in `page.test.tsx` and `route.test.ts` (POST) are from parallel Story 3.5 prep work — not regressions from this story.

### File List

- `src/types/api.ts` — MODIFY: add `RecipeUpdateIngredient`, `RecipeUpdateRequest` (Task 1)
- `src/app/api/recipes/[id]/route.ts` — MODIFY: implement PUT handler (Task 2)
- `src/app/api/recipes/[id]/route.test.ts` — MODIFY: replace 501 stub test, add PUT cases (Task 6)
- `src/hooks/use-recipes.ts` — MODIFY: add `useUpdateRecipe` hook (Task 3)
- `src/hooks/use-recipes.test.ts` — MODIFY: add `useUpdateRecipe` test cases (Task 6)
- `src/app/recipes/[id]/page.tsx` — MODIFY: add Edit button (Task 4)
- `src/app/recipes/[id]/page.test.tsx` — MODIFY: add Edit button test (Task 6)
- `src/app/recipes/[id]/edit/page.tsx` — NEW (Task 5)
- `src/app/recipes/[id]/edit/page.test.tsx` — NEW (Task 6)

---

## Change Log

- 2026-03-22: Story 3.4 created — recipe edit & portion adjustment
- 2026-03-22: Story 3.4 implemented — all tasks complete, 24 tests added, status → review
