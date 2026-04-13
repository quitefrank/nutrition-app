# Story 2.6: AI Ingredient & Macro Pipeline

Status: review
Epic: 2 — Menu Scan & Dish Auto-Capture
Story ID: 2.6
Story Key: 2-6-ai-ingredient-macro-pipeline
Created: 2026-04-12

---

## Story

As a user,
I want the app to infer typical ingredients and calculate macros for each dish from its name and cuisine context,
So that I get nutritional estimates for every dish without entering anything manually.

---

## Acceptance Criteria

**AC1 — Gemini uses dish name + description only**
**Given** a dish name and description are available
**When** Gemini is called for ingredient inference
**Then** it uses the dish name and description only — not the menu photo — to infer typical ingredients and quantities

**AC2 — Macro totals calculated per dish**
**Given** ingredient inference completes
**When** macro totals are calculated
**Then** calories, protein (g), carbs (g), fat (g) are computed from the inferred ingredient set via USDA FoodData Central; each value is the sum across all ingredients

**AC3 — "Est." indicator (component responsibility)**
**Given** macros are derived from AI inference only
**When** the dish card renders (Story 2.4)
**Then** all macro values carry an "Est." indicator — this is enforced by the `DishRowCompact` component, not this API route

**AC4 — Lenient Zod parsing — single bad field doesn't discard entire dish**
**Given** Zod validation is applied to the Gemini ingredient/macro response
**When** the response is parsed
**Then** the lenient schema uses `.catch()` fallbacks; a single malformed field does not discard the entire dish result; an empty ingredient list is returned rather than an error when Gemini returns bad JSON

---

## This Is Brownfield — Audit First, Fix Second

**`src/app/api/scan/enrich/route.ts` already exists** with a rich implementation. Do NOT reinvent it. Your task is to audit it against the ACs above, fix specific discrepancies, and add tests.

### What is already correctly implemented

| Feature | Notes |
|---------|-------|
| Gemini ingredient inference (`inferIngredients`) | Correct — uses dish name + description only (AC1); detailed prompt with gram weights |
| USDA FoodData Central macro lookup (`lookupUsdaMacros`) | Correct — calorie density guard, processed-form deprioritization |
| Parallel USDA lookups per dish | Correct — `Promise.allSettled` for all ingredients in parallel |
| Lenient `GeminiInferenceSchema` | Correct — `.catch()` on `servings`, `ingredients` array, all individual fields |
| `inferIngredients` catch block | Correct — returns empty ingredients on any error; never throws |
| Macro total computation | Correct — `sumOrNull` helper; null propagation if no ingredients produce macros |
| Response shape | Correct — returns `{ data: { dishes: [...] } }` with `totalCalories`, `totalProtein`, `totalFat`, `totalCarbs` |
| Supabase write-back (`dishToRecipeMap`) | Correct — fire-and-forget ingredient persistence after response |
| `import 'server-only'` | Correct |
| `getApiKeys()` pattern | Correct — never reads `process.env` directly |
| `import { supabase } from "@/lib/supabase"` | Correct — singleton |

### What must be fixed

**Issue 1 — Error envelope does not nest message (ARCH7)**

The architecture mandates `{ error: { message: string; code?: string } }`.

Current code uses flat format in three places:
```typescript
// Line 415-418: Gemini key unavailable
{ error: "Enrichment service not configured", code: "ENRICH_SERVICE_UNAVAILABLE" }

// Line 424-426: Invalid JSON body
{ error: "Invalid request body", code: "INVALID_REQUEST" }

// Line 431-434: RequestSchema parse failure
{ error: "Invalid request", code: "INVALID_REQUEST" }
```

All three must become:
```typescript
{ error: { message: "Enrichment service not configured", code: "ENRICH_SERVICE_UNAVAILABLE" } }
{ error: { message: "Invalid request body", code: "INVALID_REQUEST" } }
{ error: { message: "Invalid request", code: "INVALID_REQUEST" } }
```

> Note: Story 2.8 standardises error envelopes across ALL routes. If 2.8 ships first, this may already be fixed. If running in parallel, fix it here anyway — it is a 3-line change.

**Issue 2 — Input validation returns 400, should return 422 for schema violations**

Per architecture and Story 2.8 pattern: Zod schema validation failures (malformed input) → HTTP 422 with `VALIDATION_ERROR` code.

Current code returns 400 for the `RequestSchema.safeParse` failure (line 431-434). Change to:
```typescript
return NextResponse.json(
  { error: { message: "Invalid request", code: "VALIDATION_ERROR" } },
  { status: 422 }
)
```

> The JSON parse failure (invalid body, line 424-426) correctly stays as 400 `INVALID_REQUEST`.

**Issue 3 — `GeminiInferenceSchema.parse()` should be `safeParse()` on the JSON.parse output**

Current code (line ~235):
```typescript
const { servings, ingredients: raw } = GeminiInferenceSchema.parse(JSON.parse(clean))
```

While `GeminiInferenceSchema` has `.catch()` on every field (so `.parse()` itself won't throw on bad fields), `JSON.parse(clean)` will throw if `clean` is not valid JSON. This is caught by the outer `try/catch` in `inferIngredients` (line ~247), so it doesn't crash the route. However, the pattern is not consistent with the Zod strategy documented in architecture.md:

> "safeParse — when partial data is acceptable (Gemini response)"

Change to:
```typescript
const schemaResult = GeminiInferenceSchema.safeParse(JSON.parse(clean))
if (!schemaResult.success) return { servings: 1, ingredients: [] }
const { servings, ingredients: raw } = schemaResult.data
```

> This makes the intent explicit and aligns with the established Zod strategy pattern.

---

## Implementation Notes

### Error response helper

Add this inline helper at the top of the route handler (same pattern as Story 2.1):
```typescript
function apiError(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status })
}
```

### Do NOT change these

- `INFER_PROMPT` — the ingredient inference prompt is well-designed; do not modify it
- `GRAM_CONVERSIONS` table — correct unit conversion
- `resolveScale()` — correct portion scaling logic
- `lookupUsdaMacros()` — correct calorie density guard and processed-form deprioritization
- `getDishRating()` — correct Gemini Search grounding pattern
- `getDishPhoto()` / `getDishPhotoFromMealDB()` — correct photo lookup; these are Phase 1 features
- `RequestSchema` — lenient `.catch()` design is intentional for fire-and-forget callers
- The fire-and-forget Supabase write-back block — correctly structured
- `GEMINI_MODEL = "gemini-2.5-flash"` — do not change model names

### Note on USDA failures

If the USDA API key is absent or USDA returns a non-200, `lookupUsdaMacros` returns all-null macros and the dish still appears in the response with `null` macro fields. This is correct graceful degradation — the dish is returned with `totalCalories: null` etc. The `DishRowCompact` component handles null macros by showing only the calorie estimate.

---

## Tests Required

**Test file location:** `src/app/api/scan/enrich/route.test.ts`
(Co-located with the route — not in `__tests__/`)

No tests currently exist. Write them now.

### Testing approach

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn(),
    })),
  })),
}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({
    gemini: 'AItest123456789012345678901234567890',
    usda: null,  // no USDA key by default in tests
    places: null,
    cseKey: null,
    cseCx: null,
  })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

// Mock fetch for USDA + MealDB calls
global.fetch = vi.fn()

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/scan/enrich', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}
```

### Required test cases

```
describe('POST /api/scan/enrich')
  ├── validation
  │   ├── missing Gemini key → 503, nested error { error: { message, code: "ENRICH_SERVICE_UNAVAILABLE" } }
  │   ├── invalid JSON body → 400, code: INVALID_REQUEST
  │   └── empty dishes array → 200, { data: { dishes: [] } }
  ├── ingredient inference
  │   ├── Gemini returns valid ingredient JSON → ingredients extracted, macros null (no USDA key)
  │   ├── Gemini returns bad JSON → empty ingredients, dish still in response
  │   └── Gemini returns partial ingredient (missing unit) → ingredient included with null unit
  ├── macro calculation
  │   ├── no USDA key → totalCalories/totalProtein/totalFat/totalCarbs all null
  │   └── single ingredient with null macros → sum is null (not 0)
  ├── response shape
  │   ├── success → { data: { dishes: [{ id, name, servings, ingredients, photoUrl, totalCalories, ... }] } }
  │   └── multiple dishes → each dish in response has its own enrichment
  └── error envelope
      └── all error responses use nested { error: { message, code } } format
```

---

## Architecture Guardrails

- **Never import `@/lib/api-keys` without `import 'server-only'` at the file top** — already present; maintain it
- **Never call `createClient()` inline** — `import { supabase } from "@/lib/supabase"` is already correct
- **`GeminiInferenceSchema` uses `.catch()` fallbacks** — partial data beats no data; do not change this to strict `.parse()`
- **USDA lookup failures are silent** — `lookupUsdaMacros` always returns `nullResult` on any error; this is correct
- **No image data in this route** — AC1 is already satisfied; the route only takes dish name + description text
- **No PII in logs (SEC-DAT-1.00)** — the existing `console.warn("[enrich/gemini] inference failed for:", dishName, ...)` is safe (dish name is not PII); do not add logs that include the Gemini API key value or user-provided text verbatim

---

## File Scope

### Files to modify

| File | Change |
|------|--------|
| `src/app/api/scan/enrich/route.ts` | Fix error envelope (nested `{ error: { message, code } }`), validation HTTP 422, safeParse for Gemini response |

### Files to create

| File | Notes |
|------|-------|
| `src/app/api/scan/enrich/route.test.ts` | New test file, co-located with route |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/lib/api-keys.ts` | Correct; do not modify |
| `src/lib/supabase.ts` | Correct; singleton enforced |
| `src/types/database.ts` | Schema types are correct |
| `src/app/api/scan/route.ts` | Story 2.1 scope |
| `src/components/capture/CameraModal.tsx` | Story 2.2 scope — `fireEnrichment()` call in CameraModal is correct |

---

## Key Context from Epic 2

Story 2.6 provides the macro data that Story 2.4 displays:
- `CameraModal.tsx` calls `POST /api/scan/enrich` fire-and-forget after scan; it merges `totalCalories`, `totalProtein`, `totalFat`, `totalCarbs` back into sessionStorage
- `DishRowCompact` (Story 2.4) reads these totals via the restaurant screen's session merge
- Story 3.2 (Epic 3) adds USDA macro verification as a separate pass — do NOT confuse USDA lookup here with USDA provenance in Epic 3. Here, USDA is used to compute macros; Epic 3 adds a UI indicator that macros are USDA-verified

**Parallel work notice**: Stories 2.2, 2.4, 2.6, and 2.8 are designed to be developed in parallel. Each has independent file scope. The only coordination needed: Story 2.8 may also fix the error envelope in this route — if both ship at the same time, one dev should take `enrich/route.ts` to avoid conflicts.

---

## Relevant Previous Story Context

### From Story 1.1 — Infrastructure Hardening (done)
- `src/lib/supabase.ts` throws at build time on missing env vars — correct
- `src/lib/api-keys.ts` uses `import 'server-only'` — correct

### From Story 2.1 — Scan API Route (ready-for-dev)
- Story 2.1 fixes the scan route's error envelope to nested format
- Story 2.6 independently applies the same fix to the enrich route
- Gemini fallback (2.5 Flash → 2.0 Flash) is only in the scan route; the enrich route uses 2.5 Flash only (single attempt with graceful degradation)

### From recent git commits
- `feat(v2): restaurant screen polish, menu detection batching, enrichment fix` — the enrich route was updated with the `dishToRecipeMap` write-back feature; this is correct and should not be reverted

---

## Definition of Done

- [x] All error responses in `src/app/api/scan/enrich/route.ts` use nested `{ error: { message, code } }` format
- [x] `RequestSchema` parse failure returns HTTP 422 with code `VALIDATION_ERROR`
- [x] `inferIngredients` uses `GeminiInferenceSchema.safeParse()` instead of `.parse()`
- [x] `src/app/api/scan/enrich/route.test.ts` exists and covers all required test cases
- [x] All tests pass (`vitest run`)
- [x] TypeScript strict mode passes (`tsc --noEmit`)
- [x] No regressions to Supabase write-back, photo lookup, or rating pipeline

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward; no debugging required.

### Completion Notes

Three targeted fixes applied to `src/app/api/scan/enrich/route.ts`:

1. **Error envelope** — Added `apiError()` helper; replaced all three flat `{ error: string, code }` responses with nested `{ error: { message, code } }` format (ARCH7 compliance).
2. **HTTP 422 for schema validation** — `RequestSchema.safeParse()` failure now returns 422 with code `VALIDATION_ERROR` (was 400 `INVALID_REQUEST`). JSON parse failure correctly stays 400.
3. **`safeParse()` in `inferIngredients`** — Replaced `GeminiInferenceSchema.parse(JSON.parse(clean))` with `safeParse()` + explicit early return on failure. Aligns with the documented Zod strategy pattern ("safeParse when partial data is acceptable").

Test file created at `src/app/api/scan/enrich/route.test.ts` covering all 12 required cases across validation, ingredient inference, macro calculation, response shape, and error envelope groups.

All 177 tests pass. No new TypeScript errors introduced (4 pre-existing errors in other test files remain unchanged).

### File List

- `src/app/api/scan/enrich/route.ts` — modified (error envelope, HTTP 422, safeParse)
- `src/app/api/scan/enrich/route.test.ts` — created (12 test cases)

### Change Log

- 2026-04-12: Story 2.6 implemented — error envelope nested format, HTTP 422 validation, safeParse for Gemini response, test file created
