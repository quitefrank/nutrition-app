# Story 2.8: API Route Validation & Error Envelope Standardisation

Status: review
Epic: 2 — Menu Scan & Dish Auto-Capture
Story ID: 2.8
Story Key: 2-8-api-route-validation-error-envelope
Created: 2026-04-12

---

## Story

As a client application,
I want every API route to return errors in the same `{ error: { message, code } }` envelope and use HTTP 422 for Zod schema validation failures,
So that one error-handling branch handles all routes without special-casing.

---

## Acceptance Criteria

**AC1 — Nested error envelope on all routes**
**Given** any API route returns an error response
**When** the client receives it
**Then** the response body is `{ error: { message: string; code: string } }` — never flat `{ error: string, code: string }`

**AC2 — HTTP 422 for Zod validation failures**
**Given** a request body fails `RequestSchema.safeParse()` (malformed or missing fields)
**When** the route responds
**Then** HTTP status is 422, code is `VALIDATION_ERROR`

**AC3 — HTTP 400 retained for JSON parse failures**
**Given** the request body is not valid JSON
**When** the route responds
**Then** HTTP status remains 400, code is `INVALID_REQUEST` — JSON parse failures are client payload errors, not schema violations

**AC4 — `scan/enrich` route coordinate with Story 2.6**
**Given** Stories 2.6 and 2.8 both fix error envelopes in `scan/enrich/route.ts`
**When** both stories are in flight simultaneously
**Then** only ONE developer takes the `scan/enrich` route change — not both

---

## This Is Brownfield — Audit First, Fix Second

Six routes currently return flat `{ error: string, code: string }` objects. **Do NOT reinvent any route.** Your task is to apply the nested envelope fix to each, convert validation 400s to 422, and add co-located tests.

The scan route (`src/app/api/scan/route.ts`) is **NOT in scope** — it is fixed by Story 2.1.

---

## Route-by-Route Audit

### `src/app/api/places/nearby/route.ts`

| Line | Current | Fix |
|------|---------|-----|
| 42–45 | `{ error: "Location service not configured", code: "SERVICE_UNAVAILABLE" }` | Nested; keep 503 |
| 52–55 | `{ error: "Invalid request body", code: "INVALID_REQUEST" }` | Nested; keep 400 |
| 60–66 | `{ error: "lat and lng are required...", code: "INVALID_REQUEST" }`, status 400 | Nested; **change to 422 + `VALIDATION_ERROR`** |
| 109–112 | `{ error: "Location lookup failed", code: "PLACES_ERROR" }` | Nested; keep 502 |
| 141–144 | `{ error: "Internal server error", code: "INTERNAL_ERROR" }` | Nested; keep 500 |

### `src/app/api/places/search/route.ts`

| Line | Current | Fix |
|------|---------|-----|
| 39–42 | `{ error: "Restaurant search unavailable", code: "PLACES_UNAVAILABLE" }` | Nested; keep 503 |
| 49–52 | `{ error: "Invalid request body", code: "INVALID_REQUEST" }` | Nested; keep 400 |
| 57–59 | `{ error: "query is required", code: "INVALID_REQUEST" }`, status 400 | Nested; **change to 422 + `VALIDATION_ERROR`** |
| 103–106 | `{ error: "Restaurant search unavailable", code: "PLACES_UNAVAILABLE" }` | Nested; keep 503 |
| 134–137 | `{ error: "Restaurant search unavailable", code: "PLACES_UNAVAILABLE" }` | Nested; keep 503 |

### `src/app/api/places/photos/route.ts`

| Line | Current | Fix |
|------|---------|-----|
| 22–24 | `{ error: 'Places service not configured', code: 'PLACES_SERVICE_UNAVAILABLE' }` | Nested; keep 503 |
| 32–34 | `{ error: 'placeId is required', code: 'INVALID_REQUEST' }`, status 400 | Nested; **change to 422 + `VALIDATION_ERROR`** |

### `src/app/api/scan/upload/route.ts`

This route is intentionally non-fatal — most error paths return `{ photoUrl: null }` with 200. Only two explicit error responses need fixing:

| Line | Current | Fix |
|------|---------|-----|
| 60–62 | `{ error: "Invalid request body" }` (no code!) | `{ error: { message: "Invalid request body", code: "INVALID_REQUEST" } }`; keep 400 |
| 65–68 | `{ error: "imageBase64, mimeType, and recipeId are required", code: "INVALID_REQUEST" }`, status 400 | Nested; **change to 422 + `VALIDATION_ERROR`** |

> Note: `{ photoUrl: null }` responses at lines 55, 79, 95, 104 are **not error envelopes** — they are graceful no-op successes. Do NOT modify them.

### `src/app/api/restaurants/auto-scan/route.ts`

| Line | Current | Fix |
|------|---------|-----|
| 183–186 | `{ error: 'Places service not configured', code: 'PLACES_SERVICE_UNAVAILABLE' }` | Nested; keep 503 |
| 198–201 | `{ error: 'Scan service not configured', code: 'SCAN_SERVICE_UNAVAILABLE' }` | Nested; keep 503 |
| 209–212 | `{ error: 'Invalid request body', code: 'INVALID_REQUEST' }` | Nested; keep 400 |
| 217–220 | `{ error: 'placeId is required', code: 'INVALID_REQUEST' }`, status 400 | Nested; **change to 422 + `VALIDATION_ERROR`** |
| 251–254 | `{ error: 'Not enough photos found...', code: 'NO_PHOTOS' }` | Nested; keep 503 |
| 282–285 | `{ error: 'Could not retrieve restaurant photos', code: 'NO_PHOTOS' }` | Nested; keep 503 |
| 348–351 | `{ error: 'Photo classification failed', code: 'SCAN_UNAVAILABLE' }` | Nested; keep 503 |
| 444–447 | `{ error: 'Internal server error', code: 'INTERNAL_ERROR' }` | Nested; keep 500 |

### `src/app/api/import/route.ts`

| Line | Current | Fix |
|------|---------|-----|
| 115–118 | `{ error: "Import service not configured", code: "IMPORT_SERVICE_UNAVAILABLE" }` | Nested; keep 503 |
| 125–128 | `{ error: "Invalid request body", code: "INVALID_REQUEST" }` | Nested; keep 400 |
| 133–136 | `{ error: parsed.error.issues[0]?.message..., code: "INVALID_URL" }`, status 400 | Nested; **change to 422 + `VALIDATION_ERROR`**; simplify message to `"Invalid request"` |
| 163–165 | `{ error: "Could not fetch that URL...", code: "URL_UNREACHABLE" }` | Nested; keep 503 |
| 174–177 | `{ error: "The recipe page took too long...", code: "URL_TIMEOUT" }` | Nested; keep 503 |
| 178–181 | `{ error: "Could not fetch that URL.", code: "URL_UNREACHABLE" }` | Nested; keep 503 |
| 188–191 | `{ error: "The page didn't contain enough readable text.", code: "NO_CONTENT" }` | Nested; keep 422 |
| 209–211 | `{ error: "AI extraction temporarily unavailable.", code: "AI_UNAVAILABLE" }` | Nested; keep 503 |
| 222–225 | `{ error: "Unexpected response from AI.", code: "AI_RESPONSE_UNPARSEABLE" }` | Nested; keep 422 |
| 230–233 | `{ error: "Unexpected response structure from AI.", code: "AI_RESPONSE_INVALID" }` | Nested; keep 422 |
| 239–242 | `{ error: "No recipe was found at that URL.", code: "NO_RECIPE_FOUND" }` | Nested; keep 422 |
| 254–257 | `{ error: "Internal server error", code: "INTERNAL_ERROR" }` | Nested; keep 500 |

> Additional note: `import/route.ts` returns `{ recipe }` at line 252 (success path). This is a legacy response shape — it should be `{ data: { recipe } }` per ARCH7. Include this fix as part of this story. Clients that consume this route (`ImportScreen.tsx`) must be checked and updated to read `data.recipe` instead of `recipe`.

---

## Implementation Notes

### Error response helper — add to each route

Add this inline helper at the top of each route handler (same pattern as Story 2.1 and Story 2.6):

```typescript
function apiError(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status })
}
```

Then replace every `NextResponse.json({ error: "...", code: "..." }, ...)` call with `apiError(...)`.

This helper is route-scoped — do NOT extract it to a shared utility. The architecture mandates that each route owns its error shape; a shared util creates a cross-route coupling that makes routes harder to reason about independently.

### Validation status: 400 vs 422

The rule is:
- `req.json()` throws (body is not valid JSON) → **400 `INVALID_REQUEST`** — the client sent malformed bytes
- `RequestSchema.safeParse()` fails (body is valid JSON but wrong shape) → **422 `VALIDATION_ERROR`** — the client's data didn't match the contract

This distinction applies across all six routes.

### `import/route.ts` — success response shape fix

Change line 252 from:
```typescript
return NextResponse.json({ recipe });
```
To:
```typescript
return NextResponse.json({ data: { recipe } });
```

Then check `src/components/screens/ImportScreen.tsx` — find where it reads the import API response and update to read `data.recipe` instead of bare `recipe`.

### `scan/enrich/route.ts` — macro value validation

When applying Zod validation to the Gemini response parsed in `scan/enrich/route.ts`, macro fields must be constrained to finite, non-negative numbers. A negative or non-finite value from Gemini is a data contract violation — it should be coerced to `null` (or rejected) rather than passed to the client.

Suggested Zod refinement for the enrichment response schema:
```typescript
const nonNegativeNumber = z.number().finite().nonnegative().nullable()
// apply to: totalProtein, totalCarbs, totalFat, estimatedCalories
```

**Why this matters:** `DishRowCompact` uses `Number.isFinite(v) && v >= 0` as a last-resort guard before rendering macro chips, but the right fix is upstream validation in this route — the UI guard is a safety net, not the primary defence.

---

### `scan/enrich/route.ts` — coordination with Story 2.6

Story 2.6 also fixes the error envelope in `scan/enrich/route.ts`. The two stories have overlapping file scope. Coordinate:
- If Story 2.6 ships first, `scan/enrich/route.ts` is **already fixed** — skip it in this story
- If Story 2.8 ships first, apply the fix here and Story 2.6 should not re-apply it
- If running in parallel, assign `scan/enrich/route.ts` to exactly one developer

---

## Tests Required

**Test file locations:** Co-located with each route — not in `__tests__/`.

| Route | Test file |
|-------|-----------|
| `src/app/api/places/nearby/route.ts` | `src/app/api/places/nearby/route.test.ts` |
| `src/app/api/places/search/route.ts` | `src/app/api/places/search/route.test.ts` |
| `src/app/api/places/photos/route.ts` | `src/app/api/places/photos/route.test.ts` |
| `src/app/api/scan/upload/route.ts` | `src/app/api/scan/upload/route.test.ts` |
| `src/app/api/restaurants/auto-scan/route.ts` | `src/app/api/restaurants/auto-scan/route.test.ts` |
| `src/app/api/import/route.ts` | `src/app/api/import/route.test.ts` |

No tests currently exist for any of these routes. Write them now.

### Mock boilerplate (apply to each route test)

```typescript
import { vi, describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({
    gemini: 'AItest123456789012345678901234567890',
    usda: null,
    places: 'places-test-key',
    cseKey: null,
    cseCx: null,
    supabaseServiceRole: null,
  })),
}))

vi.mock('@/lib/menuCache', () => ({
  getCachedMenu: vi.fn().mockResolvedValue(null),
  cacheMenu: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

global.fetch = vi.fn()
```

For `scan/upload`, also mock `@supabase/supabase-js`:
```typescript
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => null), // null = storage not configured
}))
```

For `restaurants/auto-scan` and `import`, also mock `@google/generative-ai`:
```typescript
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn(),
    })),
  })),
}))
```

### Required test cases per route

Each route test file must cover these three envelope cases at minimum:

```
describe('POST|GET /api/<route>')
  ├── missing API key → 503, nested { error: { message, code } }
  ├── invalid JSON body → 400, code: INVALID_REQUEST, nested envelope
  ├── Zod validation failure → 422, code: VALIDATION_ERROR, nested envelope
  └── success → { data: ... } shape (or { photoUrl } for upload)
```

**`places/nearby/route.test.ts`** additional cases:
```
  ├── Places API returns non-200 → 502, code: PLACES_ERROR, nested envelope
  └── success → { data: [{ placeId, name, address, rating, userRatingCount, photoUrl }] }
```

**`places/search/route.test.ts`** additional cases:
```
  ├── Places API returns non-200 → 503, code: PLACES_UNAVAILABLE, nested envelope
  └── success → { data: [{ placeId, name, address, rating, userRatingCount, photoUrl }] }
```

**`import/route.test.ts`** additional cases:
```
  ├── missing Gemini key → 503, code: IMPORT_SERVICE_UNAVAILABLE, nested envelope
  ├── target URL unreachable (fetch throws) → 503, nested envelope
  ├── target URL returns non-200 → 503, code: URL_UNREACHABLE, nested envelope
  ├── Gemini returns non-JSON → 422, code: AI_RESPONSE_UNPARSEABLE, nested envelope
  ├── Gemini returns no recipe (name="") → 422, code: NO_RECIPE_FOUND, nested envelope
  └── success → { data: { recipe: { name, ingredients, ... } } }   ← data wrapper (new shape)
```

**`restaurants/auto-scan/route.test.ts`** — focus on validation and envelope only (full flow is complex):
```
  ├── missing Places key → 503, nested envelope
  ├── missing Gemini key → 503, code: SCAN_SERVICE_UNAVAILABLE, nested envelope
  ├── invalid JSON body → 400, code: INVALID_REQUEST, nested envelope
  └── missing placeId → 422, code: VALIDATION_ERROR, nested envelope
```

---

## Architecture Guardrails

- **`import 'server-only'` must stay at the top of every route file** — already present; do not remove
- **`getApiKeys()` is the only way to access API keys** — never access `process.env` directly
- **`apiError()` helper is route-scoped** — do not extract to `@/lib/` or `@/utils/`; it's intentionally local to avoid cross-route coupling
- **Do not modify `{ photoUrl: null }` responses in `scan/upload`** — these are intentional non-fatal success responses
- **Do not modify Zod schemas** — only the response shape changes, not the validation logic
- **`PlacesResponseSchema.parse()` in `places/nearby` and `places/search`** — these use `.parse()` (not `.safeParse()`) on external API responses, which is correct; the `.catch([])` on the array field prevents throws; do not change them
- **`import/route.ts` uses `RecipeSchema.safeParse()`** — this is correct; do not change it

---

## File Scope

### Files to modify

| File | Changes |
|------|---------|
| `src/app/api/places/nearby/route.ts` | Nested error envelope on all error paths; 400 → 422 for Zod validation |
| `src/app/api/places/search/route.ts` | Nested error envelope on all error paths; 400 → 422 for Zod validation |
| `src/app/api/places/photos/route.ts` | Nested error envelope on all error paths; 400 → 422 for Zod validation |
| `src/app/api/scan/upload/route.ts` | Nested error envelope on explicit error responses; 400 → 422 for Zod validation; add missing `code` field |
| `src/app/api/restaurants/auto-scan/route.ts` | Nested error envelope on all error paths; 400 → 422 for Zod validation |
| `src/app/api/import/route.ts` | Nested error envelope on all error paths; 400 → 422 for Zod validation; `{ recipe }` → `{ data: { recipe } }` success response |
| `src/components/screens/ImportScreen.tsx` | Update to read `data.recipe` from import API response (follows `import/route.ts` shape fix) |

### Files to create

| File | Notes |
|------|-------|
| `src/app/api/places/nearby/route.test.ts` | New test file, co-located with route |
| `src/app/api/places/search/route.test.ts` | New test file, co-located with route |
| `src/app/api/places/photos/route.test.ts` | New test file, co-located with route |
| `src/app/api/scan/upload/route.test.ts` | New test file, co-located with route |
| `src/app/api/restaurants/auto-scan/route.test.ts` | New test file, co-located with route |
| `src/app/api/import/route.test.ts` | New test file, co-located with route |

### Files conditionally in scope

| File | Condition |
|------|-----------|
| `src/app/api/scan/enrich/route.ts` | Only if Story 2.6 has NOT already fixed its error envelope; otherwise skip |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/app/api/scan/route.ts` | Story 2.1 scope — envelope already fixed there |
| `src/lib/api-keys.ts` | Correct; do not modify |
| `src/lib/supabase.ts` | Correct; singleton enforced |
| `src/lib/placesPhotos.ts` | Utility — not a route; not in scope |
| `src/lib/menuCache.ts` | Correct; do not modify |

---

## Key Context from Epic 2

Story 2.8 is the safety net for the entire API layer:
- Story 2.1 fixes the scan route (covered there; do not duplicate)
- Story 2.6 fixes the enrich route (coordinate; do not duplicate)
- Stories 2.2, 2.4, 2.6, and 2.8 are designed to run in parallel with independent file scope — the only coordination point is `scan/enrich/route.ts` between 2.6 and 2.8

After Story 2.8 ships, all API routes in the codebase use the same `{ error: { message, code } }` contract and the same 422/400 distinction. This unblocks a single error-handling utility in future stories.

---

## Relevant Previous Story Context

### From Story 1.1 — Infrastructure Hardening (done)
- `src/lib/supabase.ts` throws at build time on missing env vars — do not inline `createClient()`
- `src/lib/api-keys.ts` uses `import 'server-only'` — already used correctly in all affected routes

### From Story 2.1 — Scan API Route (ready-for-dev)
- Story 2.1 establishes the `apiError()` helper pattern; Story 2.8 applies the same pattern to all remaining routes
- Both stories use the same nested `{ error: { message, code } }` contract from architecture.md

### From Story 2.6 — AI Ingredient & Macro Pipeline (ready-for-dev)
- Story 2.6 also applies `apiError()` to `scan/enrich/route.ts` — coordinate which story owns that file

### From recent git commits
- `feat(v2): restaurant screen polish, menu detection batching, enrichment fix` — `auto-scan` route was updated with batched detection; the error paths in the new batching code are included in this story's audit

---

## Definition of Done

- [ ] All error responses in `places/nearby/route.ts` use nested `{ error: { message, code } }` format
- [ ] All error responses in `places/search/route.ts` use nested `{ error: { message, code } }` format
- [ ] All error responses in `places/photos/route.ts` use nested `{ error: { message, code } }` format
- [ ] All error responses in `scan/upload/route.ts` use nested `{ error: { message, code } }` format (with `code` field added where missing)
- [ ] All error responses in `restaurants/auto-scan/route.ts` use nested `{ error: { message, code } }` format
- [ ] All error responses in `import/route.ts` use nested `{ error: { message, code } }` format
- [ ] `import/route.ts` success response shape is `{ data: { recipe } }`
- [ ] `ImportScreen.tsx` updated to read `data.recipe`
- [ ] Zod schema failures return HTTP 422 with code `VALIDATION_ERROR` across all modified routes
- [ ] JSON parse failures retain HTTP 400 with code `INVALID_REQUEST` across all modified routes
- [ ] `scan/enrich/route.ts` envelope fixed (either here or confirmed done by Story 2.6)
- [ ] Six co-located test files created and all test cases pass (`vitest run`)
- [ ] TypeScript strict mode passes (`tsc --noEmit`)
- [ ] No regressions to Places API response shape, upload photo flow, auto-scan batching, or recipe import flow

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — all issues resolved during implementation.

### Completion Notes

- `scan/enrich/route.ts` was already fixed by Story 2.6 — confirmed and skipped per coordination rule.
- `scan/upload/route.ts` is intentionally non-fatal: `{ photoUrl: null }` responses on unconfigured storage were NOT modified (per architecture guardrail). Error paths (JSON parse, Zod) inside the configured-storage branch were fixed.
- `import/route.ts` success shape changed from `{ recipe }` → `{ data: { recipe } }`. `ImportScreen.tsx` updated accordingly to read `body.data?.recipe` and handle nested error envelope.
- All 249 tests pass (`vitest run`). Zero TypeScript errors introduced (6 pre-existing errors in `scan/enrich/route.ts`, `scan/route.test.ts`, `useGrocery.test.ts`, `springs.test.ts` remain unchanged).
- Mock typing note: `vi.hoisted()` factories narrow return types — `as string | undefined` casts required on all api-key mock return values; `vi.fn()` without type args used for `createClient` mock to keep return type broad.

### File List

**Modified:**
- `src/app/api/places/nearby/route.ts`
- `src/app/api/places/search/route.ts`
- `src/app/api/places/photos/route.ts`
- `src/app/api/scan/upload/route.ts`
- `src/app/api/restaurants/auto-scan/route.ts`
- `src/app/api/import/route.ts`
- `src/components/screens/ImportScreen.tsx`

**Created:**
- `src/app/api/places/nearby/route.test.ts`
- `src/app/api/places/search/route.test.ts`
- `src/app/api/places/photos/route.test.ts`
- `src/app/api/scan/upload/route.test.ts`
- `src/app/api/restaurants/auto-scan/route.test.ts`
- `src/app/api/import/route.test.ts`

**Skipped (already done by Story 2.6):**
- `src/app/api/scan/enrich/route.ts`
