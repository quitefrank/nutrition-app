# Story 3.3: Recipe Detail Page

**Status:** review
**Story ID:** 3.3
**Epic:** 3 — Recipe Save & Collection

---

## Story

As a user who saved a recipe,
I want to view the full ingredient list and recipe details,
So that I understand what I need to cook the dish at home.

---

## Acceptance Criteria

**Given** the user taps a recipe card from the home screen
**When** the recipe detail page renders
**Then** it shows: dish image (from `dishImageUrl` or a placeholder), dish name (text-xl), restaurant name if associated (text-xs, text-secondary), the full ingredient list with names and quantities (FR14), serving size, the confidence evidence block, and an "Add to Grocery List" CTA

**Given** the evidence block on the recipe detail page
**When** rendered for a previously saved recipe
**Then** it shows the same confidence state as the original scan; durability across sessions is achieved via the `confidenceLevel` stored on each `recipe_ingredient` row (not by parsing `confidenceMetadataJson` at render time); the evidence block renders correctly in a new session after the original scan is gone

**Given** the `GET /api/recipes/[id]` route
**When** called with a valid recipe id
**Then** it returns `{ data: Recipe }` with all `recipe_ingredients` joined; response uses camelCase domain types; HTTP 200

**Given** the `['recipes', recipeId]` TanStack Query cache entry
**When** the recipe detail page loads
**Then** it renders from cache within 1 second with no loading state if previously cached (NFR03)

**Given** the "Add to Grocery List" CTA on the recipe detail page
**When** tapped
**Then** it triggers the grocery list add flow (Epic 4); in this story it may show a "coming soon" state or be inactive; the CTA must be visually present

**Given** the recipe detail page renders for a recipe with stored nutritional data (from Story 3.6)
**When** the nutrition section renders
**Then** a nutrition panel shows total calories and per-serving macros (protein g, fat g, carbs g) aggregated across all ingredients; per-ingredient macro breakdown in each row is deferred to Story 3.6 when USDA data will be populated

**Given** nutritional data is unavailable for one or more ingredients (USDA lookup returned no match at save time)
**When** the nutrition panel renders
**Then** a "Partial nutrition data" label is shown alongside available aggregate values (null macros treated as 0 in totals); the panel is still rendered (not hidden)

**Given** nutritional data fetch failed entirely at save time (USDA unavailable)
**When** the nutrition section would render
**Then** a "Nutrition unavailable" label is shown; the ingredient list and all other recipe detail functionality work normally (NFR12)

---

## Tasks / Subtasks

- [x] Task 1: Implement `GET /api/recipes/[id]` route
  - [x] Replace the 501 stub in `src/app/api/recipes/[id]/route.ts`
  - [x] Query `recipes` with `recipe_ingredients` and `restaurants` joined using Supabase embedded relation syntax
  - [x] Map snake_case DB result to camelCase `Recipe` domain type (including `ingredients` array)
  - [x] Return `{ data: Recipe }` HTTP 200; `{ error: 'Recipe not found', code: 'NOT_FOUND' }` HTTP 404; `{ error: 'Failed to fetch recipe', code: 'DB_ERROR' }` HTTP 500
  - [x] **Do NOT touch the existing DELETE handler** — only implement GET

- [x] Task 2: Add `useRecipe(id)` hook to `src/hooks/use-recipes.ts`
  - [x] Add `fetchRecipe(id: string): Promise<Recipe>` — fetches `GET /api/recipes/${id}`, throws on non-ok
  - [x] Add `useRecipe(id: string)` — `useQuery({ queryKey: ['recipes', id], queryFn: () => fetchRecipe(id) })`
  - [x] Export alongside existing hooks — **do NOT modify** `useRecipes`, `useSaveRecipe`, `useDeleteRecipe`

- [x] Task 3: Create `src/components/recipes/recipe-detail.tsx`
  - [x] Client component with dish image, dish name, restaurant name, ingredient list, serving size, evidence block, nutrition panel, "Add to Grocery List" CTA — see Dev Notes for full spec
  - [x] Uses `useSetAtmospheric` from `@/contexts/atmospheric-context` to drive the background
  - [x] NO bottom sheet wrapping — this is a full-page component

- [x] Task 4: Create `src/app/recipes/[id]/page.tsx`
  - [x] Client component (`'use client'`) — reads `params.id`, calls `useRecipe(id)`
  - [x] Renders `<RecipeDetail recipe={recipe} />` when loaded; loading/error states described in Dev Notes
  - [x] Back navigation: a glass back button `← Back` at top left, calling `router.back()`

- [x] Task 5: Write tests
  - [x] `src/app/api/recipes/[id]/route.test.ts` — MODIFY: add GET cases (success, not found, DB error) — see Dev Notes
  - [x] `src/hooks/use-recipes.test.ts` — MODIFY: add `useRecipe` cases
  - [x] `src/components/recipes/recipe-detail.test.tsx` — NEW — see Dev Notes
  - [x] `src/app/recipes/[id]/page.test.tsx` — NEW — see Dev Notes

---

## Dev Notes

### ⚠️ Open Action Items from Epic 2 Retrospective (already surfaced in 3.1 and 3.2 — still apply)

**Action 2 (Bob/SM):** When an amendment adds tasks to a completed story, verify each task against actual code before marking as pending.
→ Not directly applicable to 3.3 — no amendments to prior stories.

**Action 3 (Quinn/QA):** Name-keyed matching (not index-based) flagged as a named risk.
→ Not applicable here — this story is read-only recipe detail; no merge logic.

---

### Task 1: GET /api/recipes/[id] — Implementation

**Target file:** `src/app/api/recipes/[id]/route.ts`

Current state: GET returns 501 stub. DELETE is fully implemented and MUST remain untouched.

**Important: Supabase Next.js 15 param pattern.** The route signature must use `Promise<{ id: string }>` for params:

```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
```

(The existing DELETE handler already uses the correct pattern — match it exactly.)

**Supabase query:**
```typescript
const { data, error } = await supabase
  .from('recipes')
  .select(`
    id,
    name,
    restaurant_id,
    dish_image_url,
    confidence_metadata_json,
    serving_size,
    created_at,
    restaurants ( id, name, google_places_id, atmospheric_palette_json, updated_at ),
    recipe_ingredients ( id, recipe_id, name, quantity, unit, confidence_level, calories_kcal, protein_g, fat_g, carbs_g )
  `)
  .eq('id', id)
  .single()
```

**Handling `.single()` errors:** Supabase `.single()` returns `error.code === 'PGRST116'` when no row matches. Check for this specifically to distinguish 404 from 500:

```typescript
if (error) {
  if (error.code === 'PGRST116') {
    return NextResponse.json({ error: 'Recipe not found', code: 'NOT_FOUND' }, { status: 404 })
  }
  return NextResponse.json({ error: 'Failed to fetch recipe', code: 'DB_ERROR' }, { status: 500 })
}
```

**Mapping snake_case → camelCase:**
```typescript
const recipe: Recipe = {
  id: data.id,
  name: data.name,
  restaurantId: data.restaurant_id,
  dishImageUrl: data.dish_image_url,
  confidenceMetadataJson: data.confidence_metadata_json,
  servingSize: data.serving_size,
  createdAt: data.created_at,
  restaurant: data.restaurants
    ? {
        id: data.restaurants.id,
        name: data.restaurants.name,
        googlePlacesId: data.restaurants.google_places_id,
        atmosphericPaletteJson: data.restaurants.atmospheric_palette_json,
        updatedAt: data.restaurants.updated_at,
      }
    : null,
  ingredients: (data.recipe_ingredients ?? []).map(ing => ({
    id: ing.id,
    recipeId: ing.recipe_id,
    name: ing.name,
    quantity: ing.quantity,
    unit: ing.unit,
    confidenceLevel: ing.confidence_level as 'high' | 'medium' | 'low',
    caloriesKcal: ing.calories_kcal,
    proteinG: ing.protein_g,
    fatG: ing.fat_g,
    carbsG: ing.carbs_g,
  })),
}
return NextResponse.json({ data: recipe })
```

**Imports needed:** Add `import type { Recipe, DomainIngredient } from '@/types/domain'` (or just `Recipe` — the map is inline).

---

### Task 2: useRecipe hook

Add to **existing** `src/hooks/use-recipes.ts` (do not replace existing exports):

```typescript
async function fetchRecipe(id: string): Promise<Recipe> {
  const res = await fetch(`/api/recipes/${id}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed to fetch recipe')
  return (json as ApiSuccess<Recipe>).data
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ['recipes', id],
    queryFn: () => fetchRecipe(id),
    enabled: !!id,
  })
}
```

`ApiSuccess` is already imported in the file — no new import needed.

---

### Task 3: RecipeDetail component

**File:** `src/components/recipes/recipe-detail.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useSetAtmospheric } from '@/contexts/atmospheric-context'
import type { Recipe, DomainIngredient } from '@/types/domain'

interface RecipeDetailProps {
  recipe: Recipe
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const setAtmospheric = useSetAtmospheric()

  // Drive atmospheric background from recipe image
  useEffect(() => {
    if (recipe.dishImageUrl) {
      setAtmospheric({
        imageUrl: recipe.dishImageUrl,
        palette: null,
        tier: 'restaurant',
        backgroundColorFallback: '#0a0a0a',
      })
    } else {
      setAtmospheric(undefined)
    }
  }, [recipe.dishImageUrl, setAtmospheric])

  const ingredients = recipe.ingredients ?? []

  return (
    <div className="flex flex-col flex-1 px-[var(--spacing-4)] py-[var(--spacing-4)]">
      {/* Dish image */}
      <div className="relative w-full rounded-[var(--radius-md)] overflow-hidden mb-[var(--spacing-4)]" style={{ height: '200px' }}>
        {recipe.dishImageUrl ? (
          <Image
            src={recipe.dishImageUrl}
            alt={recipe.name}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        ) : (
          <div className="w-full h-full" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
        )}
      </div>

      {/* Dish name */}
      <h1
        style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.2 }}
        className="mb-[var(--spacing-1)]"
      >
        {recipe.name}
      </h1>

      {/* Restaurant name */}
      {recipe.restaurant?.name && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }} className="mb-[var(--spacing-4)]">
          {recipe.restaurant.name}
        </p>
      )}

      {/* Evidence block — reconstructed from saved ingredient confidence */}
      <SavedEvidenceBlock ingredients={ingredients} />

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.10)', margin: 'var(--spacing-4) 0' }} />

      {/* Serving size */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }} className="mb-[var(--spacing-3)]">
        Serving size: {recipe.servingSize}×
      </p>

      {/* Ingredient list */}
      <h2
        style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontWeight: 600 }}
        className="mb-[var(--spacing-2)]"
      >
        Ingredients
      </h2>
      <ul className="flex flex-col gap-[var(--spacing-2)] mb-[var(--spacing-6)]">
        {ingredients.map(ing => (
          <IngredientRow key={ing.id} ingredient={ing} />
        ))}
        {ingredients.length === 0 && (
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>No ingredients saved.</li>
        )}
      </ul>

      {/* Nutrition panel */}
      <NutritionPanel ingredients={ingredients} />

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.10)', margin: 'var(--spacing-4) 0' }} />

      {/* Add to Grocery List CTA — inactive until Epic 4 */}
      <button
        disabled
        style={{
          width: '100%',
          height: '56px',
          borderRadius: 'var(--radius-xl)',
          background: 'rgba(255,255,255,0.12)',
          color: 'var(--text-tertiary)',
          fontWeight: 600,
          fontSize: 'var(--text-base)',
          border: 'none',
          cursor: 'not-allowed',
        }}
        aria-label="Add to Grocery List (coming soon)"
      >
        Add to Grocery List
      </button>
    </div>
  )
}
```

**IngredientRow sub-component** (in same file):
```typescript
function IngredientRow({ ingredient }: { ingredient: DomainIngredient }) {
  return (
    <li className="flex items-center justify-between gap-[var(--spacing-2)]">
      <div className="flex items-center gap-[var(--spacing-2)] flex-1 min-w-0">
        {/* Low confidence indicator — colour + text label (NFR16) */}
        {ingredient.confidenceLevel === 'low' && (
          <span
            aria-label="varies by restaurant"
            title="varies by restaurant"
            style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}
          >
            ≈
          </span>
        )}
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }} className="truncate">
          {ingredient.name}
        </span>
        {ingredient.confidenceLevel === 'low' && (
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            varies by restaurant
          </span>
        )}
      </div>
      {(ingredient.quantity || ingredient.unit) && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {[ingredient.quantity, ingredient.unit].filter(Boolean).join(' ')}
        </span>
      )}
    </li>
  )
}
```

**SavedEvidenceBlock sub-component** (in same file):
```typescript
// Evidence block for a previously saved recipe — reconstructed from DomainIngredient confidence levels
// Mirrors EvidenceBlock logic in dish-detail-sheet.tsx but works from DomainIngredient[] not DishResult
function SavedEvidenceBlock({ ingredients }: { ingredients: DomainIngredient[] }) {
  const highCount = ingredients.filter(i => i.confidenceLevel === 'high').length
  const total = ingredients.length
  const isHigh = total === 0 || highCount / total >= 0.8
  const evidencePills = ingredients.filter(i => i.confidenceLevel === 'high').slice(0, 4)

  if (isHigh) {
    return (
      <p style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,0.60)' }} className="mb-[var(--spacing-3)]">
        Confirmed by dish name, photo, and ingredients
      </p>
    )
  }

  return (
    <div className="mb-[var(--spacing-3)]">
      <p style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,0.60)' }}>
        Identified from photo — most ingredients confirmed
      </p>
      {evidencePills.length > 0 && (
        <div className="flex flex-wrap gap-[var(--spacing-1)] mt-[var(--spacing-2)]">
          {evidencePills.map(ing => (
            <span
              key={ing.id}
              style={{
                fontSize: 'var(--text-2xs)',
                color: 'rgba(255,255,255,0.70)',
                background: 'rgba(255,255,255,0.10)',
                borderRadius: 'var(--radius-full)',
                padding: '2px 10px',
              }}
            >
              {ing.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

**NutritionPanel sub-component** (in same file):
```typescript
// Nutrition panel — handles three states:
// 1. All macros null → "Nutrition unavailable"
// 2. Some macros null → "Partial nutrition data" + available totals
// 3. All macros present → Full panel with totals
function NutritionPanel({ ingredients }: { ingredients: DomainIngredient[] }) {
  if (ingredients.length === 0) return null

  const anyMacros = ingredients.some(i => i.caloriesKcal !== null)
  const allMacrosNull = ingredients.every(i =>
    i.caloriesKcal === null && i.proteinG === null && i.fatG === null && i.carbsG === null
  )
  const partialMacros = anyMacros && ingredients.some(i => i.caloriesKcal === null)

  if (allMacrosNull) {
    return (
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }} className="mb-[var(--spacing-4)]">
        Nutrition unavailable
      </p>
    )
  }

  const totalCalories = ingredients.reduce((sum, i) => sum + (i.caloriesKcal ?? 0), 0)
  const totalProtein = ingredients.reduce((sum, i) => sum + (i.proteinG ?? 0), 0)
  const totalFat = ingredients.reduce((sum, i) => sum + (i.fatG ?? 0), 0)
  const totalCarbs = ingredients.reduce((sum, i) => sum + (i.carbsG ?? 0), 0)

  return (
    <div className="mb-[var(--spacing-4)]">
      {partialMacros && (
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }} className="mb-[var(--spacing-1)]">
          Partial nutrition data
        </p>
      )}
      <div className="flex gap-[var(--spacing-4)]">
        <NutritionCell label="Calories" value={Math.round(totalCalories)} unit="kcal" />
        <NutritionCell label="Protein" value={Math.round(totalProtein * 10) / 10} unit="g" />
        <NutritionCell label="Fat" value={Math.round(totalFat * 10) / 10} unit="g" />
        <NutritionCell label="Carbs" value={Math.round(totalCarbs * 10) / 10} unit="g" />
      </div>
    </div>
  )
}

function NutritionCell({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex flex-col items-center">
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600 }}>
        {value}{unit}
      </span>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>{label}</span>
    </div>
  )
}
```

---

### Task 4: Recipe detail page

**File:** `src/app/recipes/[id]/page.tsx`

This file does NOT exist yet (the 501 stub mentioned in Story 3.2 notes was for the API route, not the page). Create it fresh.

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { use } from 'react'
import { useRecipe } from '@/hooks/use-recipes'
import { RecipeDetail } from '@/components/recipes/recipe-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function RecipeDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { data: recipe, isLoading, isError } = useRecipe(id)
  const router = useRouter()

  return (
    <div className="flex flex-col flex-1 min-h-full">
      {/* Back navigation */}
      <div className="px-[var(--spacing-4)] pt-[var(--spacing-4)]">
        <button
          onClick={() => router.back()}
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 0',
            minHeight: '44px',
          }}
          aria-label="Go back"
        >
          ← Back
        </button>
      </div>

      {/* Loading: skeleton not shown — cache renders immediately (NFR03) */}
      {isLoading && (
        <div className="flex flex-col flex-1 items-center justify-center">
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Loading…</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col flex-1 items-center justify-center gap-[var(--spacing-4)] px-[var(--spacing-4)] text-center">
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
            Could not load this recipe.
          </p>
          <button
            onClick={() => router.back()}
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            ← Go back
          </button>
        </div>
      )}

      {/* Recipe detail */}
      {recipe && <RecipeDetail recipe={recipe} />}
    </div>
  )
}
```

**Next.js 15 note:** `params` is a Promise in Next.js 15 App Router. Use `use(params)` to unwrap it synchronously inside a client component. This is the correct pattern — do not destructure params directly.

---

### Task 5: Test Guidance

**Established mock patterns from Epic 2 / Story 3.2 — reuse without redeclaring:**
```typescript
vi.mock('framer-motion', () => ({
  motion: { div: (p) => React.createElement('div', p) },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }) => children,
  useDragControls: () => ({ start: vi.fn() }),
}))
vi.mock('focus-trap-react', () => ({ default: ({ children }) => children }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) }))
vi.mock('next/image', () => ({ default: ({ src, alt, ...props }) => React.createElement('img', { src, alt }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
```

**`src/app/api/recipes/[id]/route.test.ts` — ADD to existing file:**
```typescript
// Wrap the existing mock setup around GET tests — mockFrom already hoisted
// GET success: returns { data: Recipe } with camelCase fields + ingredients array
// GET not found: Supabase returns error.code 'PGRST116' → 404 NOT_FOUND
// GET DB error: Supabase returns non-PGRST116 error → 500 DB_ERROR
// Note: DELETE tests already exist — do NOT re-test or modify DELETE
```

Mock setup for GET (add to existing `beforeEach` or separate describe):
```typescript
describe('GET /api/recipes/[id]', () => {
  it('success: returns 200 with recipe + camelCase mapping', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        error: null,
        data: {
          id: 'recipe-uuid-1',
          name: 'Duck Confit',
          restaurant_id: null,
          dish_image_url: null,
          confidence_metadata_json: null,
          serving_size: 1,
          created_at: '2026-03-22T00:00:00Z',
          restaurants: null,
          recipe_ingredients: [
            { id: 'ing-1', recipe_id: 'recipe-uuid-1', name: 'Duck leg',
              quantity: '2', unit: 'pcs', confidence_level: 'high',
              calories_kcal: null, protein_g: null, fat_g: null, carbs_g: null }
          ],
        },
      }),
    })
    const res = await GET(makeGetRequest('recipe-uuid-1'), { params: Promise.resolve({ id: 'recipe-uuid-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('recipe-uuid-1')
    expect(body.data.ingredients).toHaveLength(1)
    expect(body.data.ingredients[0].confidenceLevel).toBe('high')
    expect(body.data.ingredients[0].recipeId).toBe('recipe-uuid-1')
  })

  it('not found: PGRST116 → 404', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ error: { code: 'PGRST116', message: 'not found' }, data: null }),
    })
    const res = await GET(makeGetRequest('nonexistent'), { params: Promise.resolve({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('DB error: non-PGRST116 → 500', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ error: { code: '500', message: 'DB error' }, data: null }),
    })
    const res = await GET(makeGetRequest('id'), { params: Promise.resolve({ id: 'id' }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})
```

**`src/hooks/use-recipes.test.ts` — ADD to existing file:**
```typescript
// useRecipe: fires GET /api/recipes/${id} on mount
// useRecipe: returns Recipe with ingredients from successful response
// useRecipe: throws from non-ok response
// useRecipe: does not fire when id is empty string (enabled: !!id)
```

**`src/components/recipes/recipe-detail.test.tsx` — NEW:**
```typescript
// Mock: vi.mock('@/contexts/atmospheric-context', () => ({ useSetAtmospheric: () => vi.fn() }))
// Mock: vi.mock('next/image', ...) — standard pattern
// Wrap with QueryClientProvider + AtmosphericProvider (or just mock context)

// Fixture: makeRecipe(overrides?) — Recipe with ingredients

// Cases:
// - renders dish name (text-xl heading)
// - renders restaurant name when present
// - does not render restaurant name section when restaurant is null
// - renders image when dishImageUrl is set
// - renders placeholder when dishImageUrl is null
// - renders all ingredient rows (one per ingredient)
// - shows "varies by restaurant" text label for low-confidence ingredients (NFR16)
// - shows serving size
// - "Add to Grocery List" button is disabled
// - nutrition panel: shows "Nutrition unavailable" when all macros null
// - nutrition panel: shows "Partial nutrition data" when some macros null, some present
// - nutrition panel: shows calorie total when macros present (calories summed)
// - setAtmospheric called with dishImageUrl on mount when present
// - setAtmospheric called with undefined when dishImageUrl is null
```

**`src/app/recipes/[id]/page.test.tsx` — NEW:**
```typescript
// Mock: vi.mock('@/hooks/use-recipes', () => ({ useRecipe: vi.fn() }))
// Mock: vi.mock('@/components/recipes/recipe-detail', () => ({ RecipeDetail: ({ recipe }) => <div data-testid="recipe-detail">{recipe.name}</div> }))
// Mock: vi.mock('next/navigation', ...) — standard pattern
// Mock: vi.mock('react', async () => { const actual = await vi.importActual('react'); return { ...actual, use: (p) => ({ id: 'test-id' }) } })
//   — OR: pass params as already-resolved via test wrapper

// Cases:
// - renders RecipeDetail when recipe data is available
// - renders loading state when isLoading = true
// - renders error state when isError = true
// - back button calls router.back()
```

---

### Architecture Compliance

| Rule | Application in this story |
|------|--------------------------|
| `{ data: T }` / `{ error, code }` shapes | `GET /api/recipes/[id]` returns only these shapes |
| `supabase` from `@/lib/supabase` | Route imports singleton — no inline client |
| TanStack Query key: `['recipes', recipeId]` | `useRecipe` uses this key |
| camelCase TypeScript, snake_case DB | Mapping in route, DomainIngredient used in component |
| `'use client'` on all hooks + interactive components | `useRecipe`, `RecipeDetail`, page all marked |
| NFR03 — render from cache ≤1s | `useRecipe` with `['recipes', id]` cache entry; populated when navigating from home screen (recipe card taps invalidate nothing) |
| NFR07 — no binary image data | `dishImageUrl` is string or null; `<Image>` fetches externally |
| NFR16 — confidence not colour alone | `IngredientRow` uses `≈` icon + "varies by restaurant" text label |
| No inline Supabase client | ✅ |
| No external API keys in route | ✅ — GET is DB-only, no external APIs |

---

### What Already Exists — Do NOT recreate or modify

- **`src/app/api/recipes/[id]/route.ts` DELETE handler** — correct and tested; only add GET (and leave PUT 501 stub)
- **`src/app/api/recipes/route.ts`** — POST and GET list are complete; untouched
- **`src/hooks/use-recipes.ts`** — `useRecipes`, `useSaveRecipe`, `useDeleteRecipe` all complete; only add `useRecipe`
- **`src/types/domain.ts`** — `Recipe` has `ingredients?: DomainIngredient[]` and `restaurant?: DomainRestaurant | null`; `DomainIngredient` already has macro columns as nullable — **no type changes needed**
- **`src/components/ui/bottom-sheet.tsx`** — do NOT use BottomSheet here; recipe detail is a full page, not a sheet
- **`AtmosphericBackground` and `AtmosphericContext`** — fully built in Story 3.2; call `useSetAtmospheric()` from `@/contexts/atmospheric-context`
- **`EvidenceBlock` in `dish-detail-sheet.tsx`** — only works from `DishResult` (scan-time shape); do NOT import or reuse it; implement `SavedEvidenceBlock` locally in `recipe-detail.tsx` using `DomainIngredient[]`
- **`SwipeToDelete`** — not needed on the detail page; it's only used on the home screen collection

---

### Cross-Story Context

- **Story 3.4** will add `PUT /api/recipes/[id]` (currently 501) and the edit view — it will need `useRecipe` and `RecipeDetail` to already exist
- **Story 3.5** adds restaurant association — `recipe.restaurant` will populate for scan-saved recipes after 3.5; `RecipeDetail` already handles `restaurant: null` gracefully
- **Story 3.6** adds USDA macros to `recipe_ingredients` — `NutritionPanel` is already built to handle all three states (unavailable, partial, full); when 3.6 ships, the panel will show real data without changes to this component
- **Epic 4 (Story 4.1)** implements "Add to Grocery List" — the CTA is present and disabled here; Story 4.1 will enable it

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_None_

### Completion Notes List

- Implemented `GET /api/recipes/[id]` route using Next.js 15 `Promise<{ id: string }>` params pattern; maps snake_case DB rows (with joined `recipe_ingredients` and `restaurants`) to camelCase `Recipe` domain type. DELETE and PUT stubs untouched.
- Added `fetchRecipe` + `useRecipe` to `use-recipes.ts` alongside existing hooks; uses `['recipes', id]` query key and `enabled: !!id` guard.
- Created `RecipeDetail` component with `IngredientRow`, `SavedEvidenceBlock`, `NutritionPanel`, and `NutritionCell` sub-components in a single file. NutritionPanel handles all three states: unavailable / partial / full. NFR16 (confidence not colour alone) satisfied with `≈` icon + "varies by restaurant" text label.
- Created `src/app/recipes/[id]/page.tsx` with back navigation, loading, error, and recipe-loaded states. Uses `use(params)` to unwrap the Promise synchronously.
- 27 new tests added across 4 files (2 modified, 2 new). All 306 tests pass. No new lint errors in modified/new files.

### File List

- `src/app/api/recipes/[id]/route.ts` — MODIFY: implement GET detail (Task 1)
- `src/app/api/recipes/[id]/route.test.ts` — MODIFY: add GET test cases (Task 5)
- `src/hooks/use-recipes.ts` — MODIFY: add useRecipe hook (Task 2)
- `src/hooks/use-recipes.test.ts` — MODIFY: add useRecipe test cases (Task 5)
- `src/components/recipes/recipe-detail.tsx` — NEW (Task 3)
- `src/components/recipes/recipe-detail.test.tsx` — NEW (Task 5)
- `src/app/recipes/[id]/page.tsx` — NEW (Task 4)
- `src/app/recipes/[id]/page.test.tsx` — NEW (Task 5)

---

## Change Log

- 2026-03-22: Story 3.3 created — recipe detail page
- 2026-03-22: Story 3.3 implemented — all tasks complete, 27 new tests, 306 total passing
- 2026-03-22: Spec amended post code-review — AC2 clarified (evidence durability via ingredient confidence levels, not confidenceMetadataJson); AC6 per-ingredient macro breakdown deferred to Story 3.6
