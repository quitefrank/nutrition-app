# Story 3.6: USDA Nutritional Data at Save Time

**Status:** done
**Story ID:** 3.6
**Epic:** 3 — Recipe Save & Collection

> **Added:** Epic 2 retrospective (2026-03-22). Nutrition is a core Plately feature — positioned as "a tap away, not the hero." The USDA key and fetch pattern are already established from Story 2.4. This story is the only blocker before Epic 4 begins.

---

## Story

As a user who saves a recipe,
I want nutritional information stored alongside my ingredients,
So that I can see macros on the recipe detail page without an additional fetch.

---

## Acceptance Criteria

**Given** the user taps "Save Recipe" from the dish detail bottom sheet
**When** `POST /api/recipes` processes the save
**Then** for each ingredient, the route queries USDA FoodData Central for matching nutritional data; macro values (calories kcal, protein g, fat g, carbs g) are stored per ingredient on `recipe_ingredients`; the save completes even if USDA is unavailable (graceful degradation)

**Given** a USDA lookup matches an ingredient
**When** the match is found
**Then** macros are stored scaled to the ingredient's actual quantity using a three-tier unit resolution hierarchy:
- **Tier 1 — gram-convertible units** (`g`, `gram`, `grams`, `kg`, `oz`, `lb`, case-insensitive): convert quantity to grams using standard factors (`kg × 1000`, `oz × 28.3495`, `lb × 453.592`), then `scale = grams / 100`
- **Tier 2 — count/non-metric units with numeric quantity** (e.g. `pcs`, `piece`, `leg`, `breast`, `whole`, or any unrecognised unit): if the USDA food record includes a `servingSize` (numeric, > 0) with `servingSizeUnit` of `g`/`gram`/`grams`, use it as the gram equivalent per unit → `scale = (quantity × servingSize) / 100`; for example, `quantity: 1, unit: "leg"` and USDA `servingSize: 240g` → `scale = 2.4`
- **Tier 3 — fallback** (null quantity, non-positive quantity, or no usable USDA serving data): store the per-100g values as a reference (`scale = 1`)

In all tiers, `quantity` must parse to a positive finite number (`parseFloat(quantity) > 0`) to apply scaling; non-numeric or zero quantities fall through to the next tier or Tier 3

**Given** USDA returns no match for an ingredient or the USDA API is unavailable
**When** the ingredient is saved
**Then** macro columns are stored as null for that ingredient; no error is returned to the client; the recipe saves successfully

**Given** the `POST /api/recipes` route
**When** called
**Then** it performs USDA lookups in parallel across all ingredients via `Promise.allSettled`; total route latency must not degrade more than 2× versus a no-USDA baseline (USDA lookups run concurrently, not sequentially)

**Given** the `recipe_ingredients` schema
**When** a recipe is saved
**Then** each row stores: `id`, `recipe_id`, `name`, `quantity`, `unit`, `confidence_level`, `calories_kcal`, `protein_g`, `fat_g`, `carbs_g` (macro columns nullable)

---

## Tasks / Subtasks

- [x] Task 1: Add `lookupUsdaMacros()` helper and `resolveScale()` to `POST /api/recipes`
  - [x] Add `import { getApiKeys } from '@/lib/api-keys'` to `src/app/api/recipes/route.ts`
  - [x] Implement `resolveScale(quantity, unit, usdaServingSize, usdaServingSizeUnit)` as a module-level pure function — see Dev Notes for full implementation
  - [x] Implement `lookupUsdaMacros(name, quantity, unit, usdaKey)` as a module-level async function — captures `food.servingSize` and `food.servingSizeUnit` from USDA response alongside `foodNutrients`; calls `resolveScale()` for scaling — see Dev Notes for full implementation
  - [x] USDA endpoint: `GET https://api.nal.usda.gov/fdc/v1/foods/search?query={name}&pageSize=1&dataType=Foundation,SR%20Legacy`
  - [x] Auth header: `X-Api-Key: {usdaKey}` — use `getApiKeys().usda` (already in api-keys.ts)
  - [x] Use AbortController with 5-second timeout per ingredient call
  - [x] Extract nutrient IDs: 1008 (Energy kcal), 1003 (Protein g), 1004 (Total lipid g), 1005 (Carbohydrate g)
  - [x] Guard `Array.isArray(food.foodNutrients)` before use — return `nullResult` if not an array
  - [x] Return all nulls on any failure (network error, timeout, no match, malformed response) — never throw

- [x] Task 2: Wire USDA lookups into the `POST /api/recipes` ingredient save flow
  - [x] In POST handler, call `getApiKeys()` once at the start (before any await)
  - [x] After restaurant resolution and before ingredient insert, run `Promise.allSettled` across all ingredients
  - [x] Map `allSettled` results to macro values — fulfilled → use values, rejected → null (but `lookupUsdaMacros` never rejects, so this is a safety net)
  - [x] Replace the placeholder `calories_kcal: null, protein_g: null, fat_g: null, carbs_g: null` lines in `ingredientRows` with the resolved macro values
  - [x] If `usdaKey` is falsy (not configured), skip all USDA calls and write nulls — same outcome, no error

- [x] Task 3: Update tests in `src/app/api/recipes/route.test.ts`
  - [x] Add `vi.mock('@/lib/api-keys', ...)` at top of file — see Dev Notes for mock pattern
  - [x] Add global `fetch` mock via `vi.stubGlobal('fetch', ...)` — include `servingSize` and `servingSizeUnit` in `usdaSuccessResponse`
  - [x] Test: Tier 1 — gram unit (`g`) with quantity → macros scaled by `quantity / 100`; assert all 4 macro columns
  - [x] Test: Tier 1 — `gram` and `grams` unit variants (case-insensitive) → scaled correctly
  - [x] Test: Tier 1 — `kg` unit → correct gram conversion (`× 1000`)
  - [x] Test: Tier 1 — `oz` unit → correct gram conversion (`× 28.3495`)
  - [x] Test: Tier 2 — count unit (`pcs`) with numeric quantity + USDA `servingSize` in grams → macros scaled by `(quantity × servingSize) / 100`; assert all 4 macro columns
  - [x] Test: Tier 3 — count unit but USDA `servingSize` absent or non-gram → macros stored as per-100g reference (`scale = 1`)
  - [x] Test: quantity `"0"` or negative → falls through to Tier 3 (`scale = 1`), no zero/negative macros
  - [x] Test: USDA key configured + lookup succeeds → macros stored in `recipe_ingredients` insert call; assert fetch called with correct URL (`pageSize=1`, `dataType=Foundation,SR%20Legacy`) and `X-Api-Key` header
  - [x] Test: USDA key not configured → macros are null (all 4 columns), `fetch` not called, recipe saves normally (200)
  - [x] Test: USDA fetch returns 404 → macros are null (all 4 columns), recipe saves normally (200)
  - [x] Test: USDA fetch times out (AbortError) → macros are null (all 4 columns), recipe saves normally (200)
  - [x] Test: `Promise.allSettled` behaviour — two ingredients, USDA finds one, not the other → first ingredient has macros, second has nulls
  - [x] Test: `foodNutrients` field is not an array (unexpected USDA shape) → macros null, recipe saves normally (200)
  - [x] Test: ingredient name is empty string → `fetch` not called for that ingredient, macros null
  - [x] All existing tests (success, validation, DB error rollback, restaurant association) must remain passing — USDA mock must not break them

---

## Dev Notes

### What ALREADY EXISTS — do NOT reinvent or reimplement

**Schema (no migration needed):**
`recipe_ingredients` already has `calories_kcal NUMERIC`, `protein_g NUMERIC`, `fat_g NUMERIC`, `carbs_g NUMERIC` — all nullable. Columns were added in advance. **No SQL migration required for this story.**

**Domain types (no changes needed):**
`DomainIngredient` in `src/types/domain.ts` already has `caloriesKcal`, `proteinG`, `fatG`, `carbsG` typed as `number | null`. No changes to types.

**GET /api/recipes/[id] route (no changes needed):**
`src/app/api/recipes/[id]/route.ts` already selects `calories_kcal, protein_g, fat_g, carbs_g` in the `recipe_ingredients` join and maps them to `caloriesKcal`, `proteinG`, `fatG`, `carbsG`. The data pipe from DB to UI is **already fully wired**.

**NutritionPanel (no changes needed):**
`src/components/recipes/recipe-detail.tsx:198` has a complete `NutritionPanel` component already rendering all 3 states:
- All macros null → "Nutrition unavailable"
- Partial macros → "Partial nutrition data" + sums of available values
- All macros present → Full panel with calories, protein, fat, carbs

**USDA fetch pattern (reuse from scan/enrich/route.ts):**
`src/app/api/scan/enrich/route.ts:46–90` shows the established USDA pattern: `AbortController`, 8s timeout, `X-Api-Key` header. Story 3.6 uses the same endpoint but **per-ingredient for macros** (not per-dish for confidence). These are separate code paths.

---

### Task 1: Full `resolveScale` + `lookupUsdaMacros` implementation

Add both functions above the `POST` function in `src/app/api/recipes/route.ts`:

```typescript
import { getApiKeys } from '@/lib/api-keys'

interface UsdaMacros {
  caloriesKcal: number | null
  proteinG: number | null
  fatG: number | null
  carbsG: number | null
}

const GRAM_CONVERSIONS: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
}

// Three-tier scale resolver — returns a multiplier for per-100g USDA values
function resolveScale(
  quantity: string | null,
  unit: string | null,
  usdaServingSize: number | null | undefined,
  usdaServingSizeUnit: string | null | undefined
): number {
  const qNum = quantity ? parseFloat(quantity) : NaN
  const validQty = Number.isFinite(qNum) && qNum > 0
  const unitLower = unit?.toLowerCase().trim() ?? ''

  // Tier 1: gram-convertible units
  if (unitLower in GRAM_CONVERSIONS && validQty) {
    return (qNum * GRAM_CONVERSIONS[unitLower]) / 100
  }

  // Tier 2: count/non-metric units — use USDA serving size (grams) as gram equivalent per unit
  if (validQty && usdaServingSize && usdaServingSize > 0) {
    const servingUnitLower = usdaServingSizeUnit?.toLowerCase().trim() ?? ''
    if (servingUnitLower in GRAM_CONVERSIONS) {
      return (qNum * usdaServingSize * GRAM_CONVERSIONS[servingUnitLower]) / 100
    }
  }

  // Tier 3: fallback — per-100g reference
  return 1
}

async function lookupUsdaMacros(
  ingredientName: string,
  quantity: string | null,
  unit: string | null,
  usdaKey: string
): Promise<UsdaMacros> {
  if (!ingredientName.trim()) return { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null }
  const nullResult: UsdaMacros = { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(ingredientName)}&pageSize=1&dataType=Foundation,SR%20Legacy`,
      { headers: { 'X-Api-Key': usdaKey }, signal: controller.signal }
    )
    if (!res.ok) return nullResult
    const data = await res.json()
    const food = data?.foods?.[0]
    if (!food) return nullResult

    const nutrients: Array<{ nutrientId: number; value: number }> = Array.isArray(food.foodNutrients)
      ? food.foodNutrients
      : []
    if (nutrients.length === 0) return nullResult

    const find = (id: number): number | null => {
      const n = nutrients.find(n => n.nutrientId === id)
      return typeof n?.value === 'number' ? n.value : null
    }

    // FDC values are per 100g
    const per100 = {
      cal: find(1008),  // Energy kcal
      pro: find(1003),  // Protein g
      fat: find(1004),  // Total lipid g
      carb: find(1005), // Carbohydrate g
    }

    const scale = resolveScale(quantity, unit, food.servingSize ?? null, food.servingSizeUnit ?? null)
    const round = (v: number | null) => v !== null ? Math.round(v * scale * 10) / 10 : null

    return {
      caloriesKcal: round(per100.cal),
      proteinG: round(per100.pro),
      fatG: round(per100.fat),
      carbsG: round(per100.carb),
    }
  } catch (err) {
    console.warn('[usda] lookup failed for ingredient:', ingredientName, err instanceof Error ? err.message : err)
    return nullResult
  } finally {
    clearTimeout(timer)
  }
}
```

---

### Task 2: Wiring into the POST handler

In `POST`, call `getApiKeys()` at the start (before any awaits, since it's synchronous):

```typescript
export async function POST(req: NextRequest) {
  const { usda: usdaKey } = getApiKeys()

  // ... existing JSON parse, name/ingredients validation, restaurant resolution unchanged ...

  // After recipe INSERT, before ingredient INSERT:
  // Run USDA lookups in parallel — no-op if usdaKey is falsy
  const macroResults = body.ingredients.length > 0 && usdaKey
    ? await Promise.allSettled(
        body.ingredients.map(ing =>
          lookupUsdaMacros(ing.name, ing.quantity ?? null, ing.unit ?? null, usdaKey)
        )
      )
    : body.ingredients.map(() => ({ status: 'fulfilled' as const, value: { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null } }))

  // Build ingredient rows with macros
  const ingredientRows = body.ingredients.map((ing, i) => {
    const macros = macroResults[i].status === 'fulfilled'
      ? macroResults[i].value
      : { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null }
    return {
      recipe_id: recipe.id,
      name: ing.name,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      confidence_level: ing.confidenceLevel,
      calories_kcal: macros.caloriesKcal,
      protein_g: macros.proteinG,
      fat_g: macros.fatG,
      carbs_g: macros.carbsG,
    }
  })

  // ... rest of ingredient insert + response unchanged ...
}
```

**Key constraints:**
- `getApiKeys()` must be called once only — it reads `process.env` which is synchronous
- If `usdaKey` is falsy, skip all USDA calls and write nulls — same behaviour as USDA unavailable
- USDA lookups happen **after** the recipe INSERT but **before** the ingredient INSERT — this keeps the USDA latency on the same request and ensures the recipe row exists before ingredient rows are written
- `lookupUsdaMacros` never throws — `Promise.allSettled` is used but `rejected` branches should never occur in practice

---

### Task 3: Test mock patterns

`route.test.ts` currently mocks `@/lib/supabase` but not `@/lib/api-keys`. Add at the top of the test file:

```typescript
vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: undefined, places: undefined, usda: 'test-usda-key' })),
}))
```

For `fetch` mocking (global fetch in Node/jsdom):

```typescript
import { vi } from 'vitest'

// In beforeEach or per-test:
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Success response — includes servingSize for Tier 2 tests:
mockFetch.mockResolvedValue({
  ok: true,
  json: async () => ({
    foods: [{
      servingSize: 240,          // 1 serving = 240g (e.g. 1 duck leg)
      servingSizeUnit: 'g',
      foodNutrients: [
        { nutrientId: 1008, value: 250 },  // 250 kcal per 100g
        { nutrientId: 1003, value: 20 },   // 20g protein per 100g
        { nutrientId: 1004, value: 10 },   // 10g fat per 100g
        { nutrientId: 1005, value: 30 },   // 30g carbs per 100g
      ]
    }]
  })
})

// No match response:
mockFetch.mockResolvedValue({
  ok: true,
  json: async () => ({ foods: [] })
})

// Non-ok response:
mockFetch.mockResolvedValue({ ok: false })

// Timeout simulation:
mockFetch.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
```

**Existing tests that need the USDA mock:**
All existing POST tests call the route which now calls `getApiKeys()`. Update the supabase mock for `recipe_ingredients` to accept `calories_kcal`, `protein_g` etc. in the insert call (or use `expect.objectContaining` to not break existing assertions).

The simplest approach: in the default mock for the success test, assert that `recipe_ingredients` insert is called with `expect.objectContaining({ name: 'Duck leg' })` rather than an exact match — this avoids needing to assert on macro values in existing tests while leaving room for new macro-specific tests.

---

### Architecture Compliance

- **USDA key access:** `getApiKeys().usda` from `@/lib/api-keys` — never `process.env.USDA_API_KEY` directly (architecture rule)
- **Supabase access:** `import { supabase } from '@/lib/supabase'` — already imported in route.ts, no change
- **API response shape:** `POST /api/recipes` still returns `{ data: RecipeSaveResponse }` — unchanged. Macros are stored but not returned in the save response (client re-fetches from GET when viewing detail).
- **No inline type definitions:** `UsdaMacros` interface lives in the route file (file-local type, not exported). No need to add to `src/types/` as it's not shared across files.
- **Error handling:** USDA failure is graceful degradation (null values), not an error response — matches FR37/NFR12 pattern throughout the codebase
- **No image storage:** not applicable to this story

---

### Retro Action Items Surfaced

From **Epic 3 Retrospective (2026-03-22)**:

| # | Action | Applies to Story 3.6? |
|---|--------|----------------------|
| 1 | Create Story 3.6 — before Epic 4 | ✅ This is that story |
| 2 | `review` → `done` status update step | ✅ Update story status to `done` when code review passes |
| 3 | Verify completions against files | ✅ Check the file after implementation |
| 4 | Confirm `bun.lock` deletion | 🔔 Frank: verify before committing |
| 5 | Add `.scaffold-tmp/` to `.gitignore` | 🔔 Frank: add to .gitignore before next commit |

**Epic 4 dependency:** Story 3.6 modifies `POST /api/recipes`. Story 4.1 also touches this route (grocery item creation is via a separate `POST /api/grocery` route, not `/api/recipes`, so no direct conflict). However, 3.6 must be fully merged before 4.1 starts since both are in the critical path.

---

### Cross-Story Intelligence

**USDA is used two ways — keep code paths separate:**
1. **Confidence signal at scan time** (`/api/scan/enrich/route.ts:46–90`): per-dish lookup to upgrade low-confidence ingredient `confidenceLevel`. Uses `foods/search` with `pageSize=5`, returns a `Map<string, 'medium'>`.
2. **Nutritional data at save time** (this story, `POST /api/recipes`): per-ingredient macro lookup. Uses `foods/search` with `pageSize=1`, returns `UsdaMacros`.

Do **not** merge or share these code paths. The existing `getUsdaConfidenceUpgrades()` function in `scan/enrich/route.ts` must remain untouched.

**Story 3.3 AC3 (recipe detail)** notes: "a nutrition panel shows total calories and per-serving macros (protein g, fat g, carbs g) aggregated across all ingredients; each ingredient row shows its individual macro breakdown." This is already implemented in `NutritionPanel` at `recipe-detail.tsx:198`. **No UI work is required in this story** — once macros are stored, the panel renders automatically.

---

### What to NOT change

- `src/types/api.ts` — `IngredientResult` and `RecipeSaveRequest` unchanged; this story doesn't add new fields to the API contract
- `src/types/domain.ts` — `DomainIngredient` already has macro fields
- `src/app/api/recipes/[id]/route.ts` — GET already returns macros; PUT already preserves macro columns (line 149: "Update each ingredient row individually (preserves macro columns untouched)")
- `src/components/recipes/recipe-detail.tsx` — NutritionPanel already implemented
- `supabase/schema.sql` — macro columns already present

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_None_

### Completion Notes List

- Task 1: Replaced old `lookupUsdaMacros` with full three-tier implementation. Added `GRAM_CONVERSIONS` constant, `resolveScale()` pure function, and updated `lookupUsdaMacros` with: empty-name guard, `food.servingSize`/`food.servingSizeUnit` capture, `Array.isArray(food.foodNutrients)` guard, `resolveScale()` for scaling, and structured `console.warn` on error.
- Task 3: Updated `usdaSuccessResponse` mock to include `servingSize: 240, servingSizeUnit: 'g'`. Updated two existing tests that now reflect Tier 2 scaling (pcs + servingSize → scale=4.8 → 1200 kcal). Added 7 new tests covering Tier 1 gram/grams/kg/oz variants, Tier 3 no-servingSize and zero/negative qty, foodNutrients-not-array, and empty-name guard. All 380/380 tests pass.

### File List

- `src/app/api/recipes/route.ts` — MODIFY: add `getApiKeys()` import, `lookupUsdaMacros()` function, wire into POST handler
- `src/app/api/recipes/route.test.ts` — MODIFY: add `@/lib/api-keys` mock, `fetch` mock, USDA-specific test cases

---

## Change Log

- 2026-03-22: Story 3.6 created — USDA nutritional data at save time
- 2026-03-22: Story 3.6 implemented — `lookupUsdaMacros()` added to `POST /api/recipes`, USDA lookups wired via `Promise.allSettled`, 6 new tests added; 373/373 tests passing
- 2026-03-22: Story 3.6 returned to `ready-for-dev` after code review — AC2 amended to use three-tier unit resolution (Tier 1: gram-convertible units with standard factors; Tier 2: count/non-metric units using USDA `servingSize`; Tier 3: per-100g reference fallback); `resolveScale()` function added to Dev Notes; `lookupUsdaMacros()` updated to capture `food.servingSize`/`food.servingSizeUnit`, add `Array.isArray` guard, empty-name guard, and structured warning log; test suite expanded to cover all tiers, unit variants, and edge cases identified in review
- 2026-03-22: Story 3.6 re-implemented per amended AC2 — `GRAM_CONVERSIONS` + `resolveScale()` added to route.ts; `lookupUsdaMacros()` fully updated; test suite expanded with 7 new tests (Tier 1 variants: gram/grams/kg/oz; Tier 3 edge cases; foodNutrients guard; empty name); 380/380 tests passing; status → review
