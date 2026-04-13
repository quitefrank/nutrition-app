# Story 3.2: USDA Macro Verification API Route

Status: review
Epic: 3 — Dish Photos, USDA Nutrition & Portion Control
Story ID: 3.2
Story Key: 3-2-usda-macro-verification-api-route
Created: 2026-04-12

---

## Story

As a user,
I want dish macros to be verified against USDA FoodData Central as soon as the data is available,
So that I can trust the nutritional information I'm seeing.

---

## Acceptance Criteria

**AC1 — Ingredient lookups are batched in parallel per dish**
**Given** a dish has AI-estimated ingredients
**When** the USDA enrichment route is called
**Then** ingredient lookups are batched in a single parallel round (`Promise.allSettled`) per dish — one USDA search call per ingredient fired concurrently, not one dish at a time sequentially

**AC2 — USDA match replaces AI estimate**
**Given** USDA data is available for an ingredient
**When** macros are recalculated
**Then** USDA-sourced values replace AI-estimated values; `usda_fdc_id`, `calories_per_serving`, `protein_g`, `fat_g`, and `carbs_g` are updated in `recipe_ingredients`; the dish's macro totals are recalculated from the updated ingredient set and written to `recipes.estimated_calories`

**AC3 — Partial USDA match degrades gracefully**
**Given** USDA data is unavailable for one or more ingredients
**When** macros are displayed
**Then** AI-estimated values are retained for those ingredients (their `usda_fdc_id` stays null); the partial USDA result is used where available — macro totals are recalculated from whatever mix of USDA-verified and AI-estimated ingredient rows exist; values are never silently absent

**AC4 — Total USDA failure degrades gracefully**
**Given** the USDA API fails entirely for a dish (all ingredient fetches fail or return no match)
**When** the error is handled
**Then** AI-estimated macros remain in the database unchanged; no crash occurs; no macro values go blank; the route returns a success response with `verified: 0`

**AC5 — Strict Zod validation on USDA responses**
**Given** Zod validation is applied to USDA API responses
**When** a response is parsed
**Then** the strict schema (`parse`, throws) is used; unexpected response shapes are caught per-ingredient and logged; that ingredient falls back to its AI estimate without crashing the route

---

## This Is Brownfield — Audit First, Fix Second

New file — no existing implementation to audit.

The route `src/app/api/usda/verify/route.ts` does not yet exist. The directory `src/app/api/usda/` does not exist. Both must be created.

**Important relationship to `scan/enrich/route.ts`:**
`scan/enrich/route.ts` contains an internal `lookupUsdaMacros(ingredientName, apiKey)` helper that calls the same USDA search endpoint. Do NOT copy that function into this route. This route calls the USDA search API directly using `fetch` inline — the helper in the enrich route is private to its own module and should remain there. Duplication is acceptable here because the enrichment logic in `scan/enrich` is tightly coupled to Gemini inference; Story 3.2 is a standalone second-pass verification step operating on already-persisted ingredients.

**Logical separation from `scan/enrich/route.ts`:**
- `scan/enrich` = first pass: infers ingredients via Gemini + immediately tries USDA as part of the same pipeline
- `POST /api/usda/verify` = second pass: re-verifies only ingredients that still have `usda_fdc_id IS NULL` after the first pass, and persists results to Supabase

This route is triggered as a progressive enrichment step after the initial scan settles (Story 3.6 owns the trigger logic).

---

## Implementation Notes

### Route location

`src/app/api/usda/verify/route.ts`

### Request / response contract

**Request body:**
```json
{ "recipeIds": ["uuid-1", "uuid-2"] }
```

**Success response (200):**
```json
{
  "data": {
    "verified": 3,
    "total": 5,
    "recipes": [
      {
        "recipeId": "uuid-1",
        "totalCalories": 612,
        "totalProtein": 38.2,
        "totalFat": 22.1,
        "totalCarbs": 61.4
      }
    ]
  }
}
```

`verified` = number of ingredients updated with a USDA match.
`total` = number of ingredients that were candidates (had `usda_fdc_id IS NULL`).
If all ingredients already have `usda_fdc_id`, return `verified: 0, total: 0` and compute current recipe totals from existing rows.

**Error responses** follow ARCH7 strictly:
- `400 INVALID_REQUEST` — unparseable JSON body
- `422 VALIDATION_ERROR` — Zod input schema failure
- `503 USDA_SERVICE_UNAVAILABLE` — only if the USDA key is hardcoded to fail (should not happen; DEMO_KEY fallback prevents this)

### Skeleton structure

```typescript
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiKeys } from '@/lib/api-keys'
import { supabase } from '@/lib/supabase'

function apiError(message: string, code: string, status: 400 | 422 | 500 | 503) {
  return NextResponse.json({ error: { message, code } }, { status })
}

// ─── Input schema ──────────────────────────────────────────
const RequestSchema = z.object({
  recipeIds: z.array(z.string().uuid()).min(1),
})

// ─── USDA response schemas (strict) ───────────────────────
const UsdaFoodSchema = z.object({
  fdcId: z.number(),
  description: z.string(),
  dataType: z.string().optional(),
  foodNutrients: z.array(z.object({
    nutrientId: z.number(),
    nutrientName: z.string().optional(),
    value: z.number().optional(),
  })).optional().default([]),
})

const UsdaResponseSchema = z.object({
  foods: z.array(UsdaFoodSchema).default([]),
})

export async function POST(req: NextRequest) { ... }
```

### USDA API call pattern

```typescript
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'

// Per ingredient (called inside Promise.allSettled):
async function fetchUsdaMatch(ingredientName: string, apiKey: string) {
  const url = `${USDA_SEARCH_URL}?query=${encodeURIComponent(ingredientName)}&api_key=${apiKey}&pageSize=3`
  const res = await fetch(url)
  if (!res.ok) return null

  // Strict parse — throws on unexpected shape; caller catches
  const raw = await res.json()
  const parsed = UsdaResponseSchema.parse(raw)

  // Prefer Foundation Foods or SR Legacy
  const PREFERRED = ['Foundation', 'SR Legacy']
  const best =
    parsed.foods.find(f => PREFERRED.includes(f.dataType ?? '')) ??
    parsed.foods[0] ??
    null

  if (!best) return null
  return extractMacros(best)
}
```

### Macro extraction from USDA nutrients

USDA nutrient IDs:
- `1008` = Energy (kcal)
- `1003` = Protein (g)
- `1004` = Total Fat (g)
- `1005` = Carbohydrate (g)

```typescript
function extractMacros(food: z.infer<typeof UsdaFoodSchema>) {
  const get = (id: number) =>
    food.foodNutrients.find(n => n.nutrientId === id)?.value ?? null

  return {
    fdcId: food.fdcId,
    calories: get(1008),
    protein: get(1003),
    fat: get(1004),
    carbs: get(1005),
  }
}
```

### USDA API key

```typescript
const keys = getApiKeys()
const usdaKey = keys.usda ?? 'DEMO_KEY'
```

Never fail the route because the USDA key env var is absent. USDA allows `DEMO_KEY` with a low rate limit. The route always proceeds.

### Core algorithm

```
1. Validate JSON body → 400 on parse error
2. Validate with RequestSchema → 422 on schema error
3. Fetch all recipe_ingredients rows for given recipeIds
4. Partition into: unverified (usda_fdc_id IS NULL) vs already verified
5. If no unverified → recalculate totals from existing rows → return early with verified: 0
6. For each unverified ingredient, call fetchUsdaMatch() — run ALL in parallel with Promise.allSettled()
7. For settled results:
   a. fulfilled + non-null → UPDATE recipe_ingredients with fdcId + macros + confidence: 'high'
   b. fulfilled + null (no match) → leave row unchanged
   c. rejected → log warning; leave row unchanged
8. Re-fetch all recipe_ingredients for each recipeId to get fresh macro state
9. Compute per-recipe totals: sum calories_per_serving, protein_g, fat_g, carbs_g across all ingredients
   - Use null-safe addition: if ALL ingredients have null macros, total stays null (not 0)
   - If ANY ingredient has a value, include it in the sum (nulls treated as 0 for that field)
10. UPDATE recipes.estimated_calories with new total for each recipe
11. Return { data: { verified, total, recipes: [...] } }
```

### Supabase write pattern

Use `supabase.from('recipe_ingredients').update({...}).eq('id', row.id)` for each matched ingredient. Run these updates after all USDA fetches resolve. Use `Promise.allSettled` for the updates too — a DB write failure for one ingredient should not block others.

Do NOT use a fire-and-forget pattern here: await the Supabase writes before computing totals and returning. The caller needs the totals in the response.

### Null-safe total computation

```typescript
function sumNullable(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null)
  return valid.length === 0 ? null : valid.reduce((a, b) => a + b, 0)
}
```

Apply this for each macro field across a recipe's ingredients.

### Error logging

Use `console.warn` for per-ingredient USDA failures (not `console.error`) — these are expected degradation paths, not bugs:

```typescript
console.warn('[usda/verify] USDA fetch failed for ingredient:', ingredient.name, err)
console.warn('[usda/verify] Zod parse error for ingredient:', ingredient.name, parseErr)
```

Do not log the USDA API key value (SEC-DAT-1.00).

---

## Tests Required

**Test file location:** `src/app/api/usda/verify/route.test.ts`

Co-located with the route. No tests exist yet; create them from scratch.

### Mock setup

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ usda: 'test-usda-key', places: null, gemini: null })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

global.fetch = vi.fn()

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/usda/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}
```

### Required test cases

```
describe('POST /api/usda/verify')
  ├── input validation
  │   ├── invalid JSON body → 400, code: INVALID_REQUEST, nested error envelope
  │   ├── missing recipeIds field → 422, code: VALIDATION_ERROR
  │   ├── recipeIds is empty array → 422, code: VALIDATION_ERROR (min(1) constraint)
  │   └── recipeIds contains non-UUID string → 422, code: VALIDATION_ERROR
  ├── no unverified ingredients
  │   ├── all ingredients already have usda_fdc_id → 200, verified: 0, total: 0, skipped: true (or equivalent)
  │   └── no recipe_ingredients rows at all → 200, verified: 0, total: 0, recipes: []
  ├── USDA match found
  │   ├── single ingredient matched → recipe_ingredients updated with fdcId, macros, confidence: 'high'
  │   ├── multiple ingredients in parallel → all matched ingredients updated; verified count correct
  │   └── partial match (some match, some don't) → matched rows updated; unmatched rows unchanged; recipe totals use available data
  ├── USDA match not found
  │   ├── USDA returns empty foods array → ingredient row unchanged (usda_fdc_id stays null)
  │   └── USDA returns foods but none have required nutrients → ingredient row unchanged
  ├── USDA failure handling
  │   ├── fetch throws for one ingredient → that ingredient unchanged; others proceed; no 500
  │   ├── fetch throws for ALL ingredients → no DB updates; recipe totals unchanged; 200 with verified: 0
  │   └── USDA returns non-200 status → ingredient treated as no-match; row unchanged
  ├── Zod parse failure on USDA response
  │   └── USDA returns unexpected shape → parse throws → ingredient unchanged; route continues; warning logged
  ├── macro total recalculation
  │   ├── totals recalculated correctly after partial USDA update
  │   ├── all null macros → totalCalories null (not 0)
  │   └── mixed null/non-null macros → nulls excluded from sum
  ├── USDA key absent
  │   └── getApiKeys().usda is null → uses DEMO_KEY; route still works (no 503)
  └── response shape
      └── all success responses use { data: { verified, total, recipes: [...] } } format
          and all error responses use { error: { message, code } } format
```

---

## Architecture Guardrails

- **ARCH7** — All responses: `{ data: T }` on success, `{ error: { message, code } }` on error. HTTP 422 for Zod input failures, 400 for unparseable JSON, 503 for service-down (not applicable here given DEMO_KEY fallback).
- **ARCH8** — Zod strategy: strict `parse` (throws) for USDA API responses. This is the opposite of the Gemini lenient strategy. Catching the throw per-ingredient and logging is the correct pattern — do not use `safeParse` for USDA.
- **ARCH18** — `import 'server-only'` at file top. All key access via `getApiKeys()`. Never read `process.env.USDA_API_KEY` directly.
- **SEC-SEC-1.00** — Never log the USDA API key value. Never include it in error responses.
- **SEC-DAT-1.00** — Ingredient names in warn logs are acceptable (they are not PII). User IDs or email addresses must never appear in logs from this route.
- **SEC-ERR-1.00** — Generic error messages in responses. Internal error details (Zod parse errors, fetch error objects) stay in server logs only.
- **No fire-and-forget** — Unlike the `scan/enrich` Supabase write-back pattern, this route must await all DB writes before returning totals. The response carries the post-update macro totals.

---

## File Scope

### Files to create

| File | Notes |
|------|-------|
| `src/app/api/usda/verify/route.ts` | New route handler — full implementation |
| `src/app/api/usda/verify/route.test.ts` | New test file, co-located with route |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/app/api/scan/enrich/route.ts` | Story 2.6 scope; the internal `lookupUsdaMacros` helper must stay there |
| `src/lib/api-keys.ts` | Correct; `usda` key already exposed |
| `src/lib/supabase.ts` | Correct; singleton enforced |
| `src/types/database.ts` | Schema types are correct; `recipe_ingredients` fields already match what this route writes |
| Any Epic 2 route | All out of scope for Story 3.2 |

---

## Key Context from Epic 3

Epic 3 enriches dish cards asynchronously after the initial scan settles. Story 3.2 is the USDA verification step in that pipeline:

- **Story 3.1** (Google Places) and **Story 3.2** (USDA) are independent parallel enrichments — neither blocks the other
- **Story 3.4** (USDA Provenance Indicators) consumes the `usda_fdc_id` field this route populates — a null `usda_fdc_id` means "Est." label; non-null means USDA-verified badge
- **Story 3.5** (Portion Adjustment) reads `protein_g`, `fat_g`, `carbs_g` from `recipe_ingredients` — correct values here are a prerequisite for Story 3.5 recalculation
- **Story 3.6** (Progressive Enrichment UX) owns the trigger: it calls `POST /api/usda/verify` after the restaurant screen settles. Story 3.2 does not concern itself with when or how it is called
- This route only touches `recipe_ingredients` rows where `usda_fdc_id IS NULL`. Re-running it on already-verified recipes is safe — it will return `verified: 0` with no DB mutations

---

## Definition of Done

- [x] `src/app/api/usda/verify/route.ts` created with full implementation
- [x] `import 'server-only'` at file top
- [x] All API keys accessed via `getApiKeys()`; USDA key falls back to `'DEMO_KEY'` when null
- [x] Input validated with strict Zod schema; 422 returned on schema failure, 400 on invalid JSON
- [x] USDA API responses validated with strict Zod `parse` (not `safeParse`); per-ingredient throws are caught and logged
- [x] Ingredient USDA lookups run in parallel via `Promise.allSettled` per dish
- [x] Preferred food data types (Foundation Foods, SR Legacy) selected over others when present
- [x] Matched ingredients updated in `recipe_ingredients` with `usda_fdc_id`, macros, `confidence: 'high'`
- [x] Unmatched or failed ingredients left unchanged (AI estimates preserved, `usda_fdc_id` stays null)
- [x] Recipe macro totals recalculated and written to `recipes.estimated_calories` after all updates
- [x] Null-safe total computation: all-null ingredient macros produce null totals, not zero
- [x] All success responses use `{ data: { verified, total, recipes: [...] } }` shape
- [x] All error responses use nested `{ error: { message, code } }` format
- [x] `src/app/api/usda/verify/route.test.ts` created, covering all required test cases
- [x] All tests pass (`vitest run`)
- [x] TypeScript strict mode passes (`tsc --noEmit`)
- [x] No modifications made to `scan/enrich/route.ts` or any Epic 2 file

---

## File List

| File | Change |
|------|--------|
| `src/app/api/usda/verify/route.ts` | Created — full POST handler implementation |
| `src/app/api/usda/verify/route.test.ts` | Created — 21 tests covering all required test cases |
| `planning/3-2-usda-macro-verification-api-route.md` | Updated — status, Definition of Done, Dev Agent Record |
| `planning/sprint-status.yaml` | Updated — status: in-progress → review |

---

## Dev Agent Record

### Implementation Notes

- Created `src/app/api/usda/verify/route.ts` as a standalone POST handler.
- Used strict `UsdaResponseSchema.parse()` (throws) for USDA API responses per ARCH8; each per-ingredient call is wrapped in `Promise.allSettled` so throws are captured as rejected promises, not crashes.
- `fetchUsdaMatch()` returns `null` on non-200 USDA responses or empty foods arrays; the caller skips the DB update.
- Supabase updates run via `Promise.allSettled` (not fire-and-forget) so totals reflect the actual DB state before returning.
- `sumNullable()` correctly returns `null` (not `0`) when all ingredient macro values are null.
- Fixed a TypeScript strict-mode issue: `updatePromises` typed as `PromiseLike<unknown>[]` instead of `Promise<unknown>[]` because the Supabase `.then()` chain returns `PromiseLike`, not `Promise`.
- Test UUIDs use proper RFC-4122 format (v4 structure) — Zod's newer UUID validator enforces this strictly.

### Completion Notes

All 21 tests pass. Full regression suite (306 tests across 25 files) passes with no failures. No TypeScript errors introduced in new files. All ACs satisfied. No Epic 2 files modified.

---

## Change Log

- 2026-04-12: Story implemented — created `src/app/api/usda/verify/route.ts` and `route.test.ts`. All 21 tests pass. Status: in-progress → review.
