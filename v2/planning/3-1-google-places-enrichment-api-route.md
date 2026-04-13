# Story 3.1: Google Places Enrichment API Route

Status: done
Epic: 3 — Dish Photos, USDA Nutrition & Portion Control
Story ID: 3.1
Story Key: 3-1-google-places-enrichment-api-route
Created: 2026-04-12

---

## Story

As a user,
I want dish photos and restaurant details to load automatically after scanning, without me having to do anything,
So that my collection looks rich and inviting without any extra effort.

---

## Acceptance Criteria

**AC1 — Single batched Places API request per restaurant**
**Given** a restaurant has been auto-captured
**When** the enrichment route is called
**Then** a single batched Places API request fetches all available data for the restaurant (name, photos, details) — one request per restaurant, not per dish

**AC2 — Restaurant and recipe records updated after successful fetch**
**Given** the Places API returns results
**When** the data is stored
**Then** `restaurants.reference_image_url` is set from the first returned photo URL; photo URLs are stored per-recipe; subsequent requests for the same restaurant reuse the cached `reference_image_url` instead of triggering a new Places API call. Full Places Details enrichment (name, address, rating) is deferred to a future story — `place_id` is assumed pre-set by the Restaurant Confirmation flow (Story 2.3).

**AC3 — `photo_status` set to `confirmed` when a photo is assigned**
**Given** the Places API call succeeds and photos are returned
**When** a dish photo URL is stored
**Then** the corresponding `recipe.photo_status` is updated from `placeholder` to `confirmed`

**AC4 — `photo_status` remains `placeholder` when the Places API returns zero photos**
**Given** the Places API call succeeds but returns an empty photos array
**When** the photo status is evaluated
**Then** all `recipe.photo_status` values remain `placeholder`; the warm placeholder tile continues to render. When photos are available, round-robin assignment ensures every placeholder recipe receives a photo URL (reusing photos if there are fewer photos than recipes).

**AC5 — Places API failure degrades gracefully; no broken UI**
**Given** the Places API call fails entirely
**When** the error is handled
**Then** all affected dish cards remain in `photo_status: 'placeholder'` state; no broken `<img>` elements are rendered; no crash occurs

---

## This Is Brownfield — Audit First, Fix Second

**New file — no existing implementation to audit.**

`src/app/api/places/enrich/route.ts` does not yet exist. The `src/app/api/places/` directory already exists and contains `photos/route.ts`, `search/route.ts`, and `nearby/route.ts`. This route is a new addition to that directory.

The supporting library `src/lib/placesPhotos.ts` already exists and is the correct fetch primitive — use it directly, do not re-implement photo fetching logic.

---

## Implementation Notes

### Route signature

```
POST /api/places/enrich
Content-Type: application/json

{ "restaurantId": "uuid" }
```

### File scaffold

```typescript
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiKeys } from '@/lib/api-keys'
import { supabase } from '@/lib/supabase'
import { getRestaurantPhotos } from '@/lib/placesPhotos'

function apiError(message: string, code: string, status: 400 | 422 | 503) {
  return NextResponse.json({ error: { message, code } }, { status })
}

const RequestSchema = z.object({
  restaurantId: z.string().uuid(),
})
```

### Handler logic (step-by-step)

**Step 1 — API key guard**

```typescript
const placesKey = getApiKeys().places
if (!placesKey) {
  return apiError('Places service not configured', 'PLACES_SERVICE_UNAVAILABLE', 503)
}
```

**Step 2 — Parse request body**

Parse body inside a `try/catch`; return 400 `INVALID_REQUEST` on JSON parse failure. Then apply `RequestSchema.safeParse()` on the raw body; return 422 `VALIDATION_ERROR` on schema failure.

```typescript
let body: unknown
try {
  body = await req.json()
} catch {
  return apiError('Invalid request body', 'INVALID_REQUEST', 400)
}

const parsed = RequestSchema.safeParse(body)
if (!parsed.success) {
  return apiError('Invalid request', 'VALIDATION_ERROR', 422)
}

const { restaurantId } = parsed.data
```

**Step 3 — Fetch restaurant row from Supabase**

```typescript
const { data: restaurant } = await supabase
  .from('restaurants')
  .select('id, place_id, reference_image_url')
  .eq('id', restaurantId)
  .maybeSingle()

if (!restaurant) {
  return NextResponse.json(
    { error: { message: 'Restaurant not found', code: 'NOT_FOUND' } },
    { status: 404 }
  )
}
```

**Step 4 — Early exit: no place_id**

```typescript
if (!restaurant.place_id) {
  return NextResponse.json({
    data: { restaurantId, photosAssigned: 0, skipped: true, reason: 'no_place_id' },
  })
}
```

**Step 5 — Cache check: already fully enriched**

Fetch all non-removed recipes for this restaurant. If every recipe already has `photo_status !== 'placeholder'`, return early.

```typescript
const { data: allRecipes } = await supabase
  .from('recipes')
  .select('id, photo_status, dish_image_url')
  .eq('restaurant_id', restaurantId)
  .neq('status', 'removed')

const recipes = allRecipes ?? []

const alreadyEnriched = recipes.length > 0 && recipes.every(r => r.photo_status !== 'placeholder')
if (alreadyEnriched) {
  return NextResponse.json({
    data: { restaurantId, photosAssigned: 0, skipped: true, reason: 'already_enriched' },
  })
}
```

> Note: if there are zero non-removed recipes, `alreadyEnriched` will be false (empty collection is not "enriched"). The route will still call Places and then assign zero photos with `photosAssigned: 0` — which is correct and harmless.

**Step 6 — Call `getRestaurantPhotos` once for this restaurant**

Wrap in `try/catch`. On throw, return 503 `PLACES_UNAVAILABLE` — all recipes stay `placeholder`.

```typescript
let photos: string[]
try {
  photos = await getRestaurantPhotos({ placeId: restaurant.place_id }, placesKey, 10)
} catch {
  return apiError('Photos unavailable', 'PLACES_UNAVAILABLE', 503)
}
```

`getRestaurantPhotos` already returns `[]` on network failure (never throws). The `try/catch` here is an extra safety net for any unexpected throw. A return of `[]` is not an error — it means no photos are available; the route should continue and return `{ photosAssigned: 0 }`.

**Step 7 — Assign photos round-robin**

Only recipes currently with `photo_status: 'placeholder'` receive photos (skip already-confirmed ones):

```typescript
const placeholderRecipes = recipes.filter(r => r.photo_status === 'placeholder')
let photosAssigned = 0

for (let i = 0; i < placeholderRecipes.length; i++) {
  if (photos.length === 0) break
  const photo = photos[i % photos.length]
  const recipe = placeholderRecipes[i]

  await supabase
    .from('recipes')
    .update({ dish_image_url: photo, photo_status: 'confirmed' })
    .eq('id', recipe.id)

  photosAssigned++
}
```

The modulo wrap (`i % photos.length`) means photos are reused in a round-robin when there are more recipes than photos. Recipes that exceed the last photo index wrap back to `photos[0]`, and so on.

**Step 8 — Update `restaurants.reference_image_url` if still null**

```typescript
if (photos.length > 0 && !restaurant.reference_image_url) {
  await supabase
    .from('restaurants')
    .update({ reference_image_url: photos[0] })
    .eq('id', restaurantId)
}
```

**Step 9 — Return success response**

```typescript
return NextResponse.json({ data: { restaurantId, photosAssigned } })
```

### Supabase update batching

The loop above issues one `UPDATE` per recipe. For a typical restaurant with 5–10 dishes this is acceptable. Do NOT use `Promise.all` for the updates — sequential updates avoid Supabase rate-limit issues for free-tier deployments.

### Error response shape

All errors must use the nested envelope per ARCH7:

```json
{ "error": { "message": "...", "code": "..." } }
```

Never return a flat `{ "error": "..." }` shape.

### Success response shape

Success path:
```json
{ "data": { "restaurantId": "uuid", "photosAssigned": 2 } }
```

Early-exit (skip) paths:
```json
{ "data": { "restaurantId": "uuid", "photosAssigned": 0, "skipped": true, "reason": "no_place_id" } }
{ "data": { "restaurantId": "uuid", "photosAssigned": 0, "skipped": true, "reason": "already_enriched" } }
```

---

## Tests Required

**Test file location:** `src/app/api/places/enrich/route.test.ts`
(Co-located with the route — not in `__tests__/`)

### Testing approach

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/placesPhotos', () => ({
  getRestaurantPhotos: vi.fn(),
}))
vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ places: 'fake-places-key', gemini: null, usda: null })),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/places/enrich', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}
```

For Supabase chain mocking, build a fluent mock that returns each chained method (`from → select → eq → maybeSingle`, `from → update → eq`). A helper that returns a configurable mock chain reduces boilerplate across test cases.

### Required test cases

```
describe('POST /api/places/enrich')
  ├── key and input validation
  │   ├── missing Places API key → 503, { error: { message, code: "PLACES_SERVICE_UNAVAILABLE" } }
  │   ├── invalid JSON body → 400, { error: { message, code: "INVALID_REQUEST" } }
  │   ├── missing restaurantId → 422, { error: { message, code: "VALIDATION_ERROR" } }
  │   └── non-UUID restaurantId → 422, { error: { message, code: "VALIDATION_ERROR" } }
  ├── database lookup
  │   └── restaurant not found in DB → 404, { error: { message, code: "NOT_FOUND" } }
  ├── early-exit (skip) paths
  │   ├── restaurant has no place_id (null) → 200, { data: { skipped: true, reason: "no_place_id" } }
  │   ├── restaurant has empty-string place_id → 200, { data: { skipped: true, reason: "no_place_id" } }
  │   ├── all recipes confirmed + reference_image_url set → 200, { data: { skipped: true, reason: "already_enriched" } }
  │   └── all recipes confirmed + suppressed + reference_image_url set → 200, { data: { skipped: true, reason: "already_enriched" } } (suppressed does not block enrichment cache)
  ├── photo assignment (first enrichment pass — reference_image_url is null)
  │   ├── Places returns 2 photos, restaurant has 5 placeholder recipes → 200, { data: { photosAssigned: 5 } }, round-robin reuse, 5 UPDATE calls
  │   ├── Places returns 0 photos → 200, { data: { photosAssigned: 0 } }, all recipes stay placeholder
  │   └── Places returns photos, reference_image_url is null → restaurants table updated with photos[0]
  ├── photo assignment (repeat enrichment pass — reference_image_url already set)
  │   └── reference_image_url set + placeholder recipes exist → 200, assigns cached URL, no Places API call
  ├── Places API failure
  │   └── getRestaurantPhotos throws → 503, { error: { message: "Photos unavailable", code: "PLACES_UNAVAILABLE" } }
  └── error envelope
      └── all error responses use nested { error: { message, code } } format (not flat { error: "..." })
```

> For the "2 photos, 5 recipes" case: verify that all 5 placeholder recipes receive updates via round-robin assignment (photosAssigned: 5, 5 UPDATE calls). Round-robin is the authoritative assignment strategy — every placeholder recipe gets a photo, reusing photos cyclically when there are fewer photos than recipes.

---

## Architecture Guardrails

- **`import 'server-only'` at the top of the file** — mandatory; this file accesses `getApiKeys()` which is server-only (ARCH18)
- **Never call `getApiKeys()` inline in a condition** — assign to a variable first: `const placesKey = getApiKeys().places`
- **Never read `process.env` directly** — use `getApiKeys()` exclusively (ARCH18)
- **Import `supabase` from `@/lib/supabase`** — never instantiate a Supabase client inline (ARCH2)
- **One batched Places call per restaurant** — `getRestaurantPhotos` is called once; never in a loop or per-dish (NFR19, ARCH12 Phase 2)
- **Zod input schema uses `parse` semantics via `safeParse` + early return** — strict: `z.string().uuid()` rejects non-UUID values (ARCH8); use `safeParse` (not `.parse()`) so errors are handled gracefully rather than throwing
- **External API responses (from `getRestaurantPhotos`) are already validated inside `placesPhotos.ts`** — the returned array is guaranteed to contain only HTTPS string URLs (SEC-SEC-1.00). No additional URL validation needed here.
- **All errors use nested `{ error: { message, code } }` envelope** (ARCH7) — never flat `{ error: "..." }`
- **HTTP 422 for Zod validation failures, 400 for JSON parse failures, 503 for external service down, 404 for missing DB record** (ARCH7)
- **No PII in logs (SEC-DAT-1.00)** — do not log the Places API key value, the restaurant name, or raw Places API response bodies; `restaurantId` is a UUID and is safe to include in log messages
- **`suppressed` recipes are transparent to enrichment** — `photo_status: 'suppressed'` recipes are hidden low-confidence dishes; they do not receive photo assignment and do not block the `already_enriched` cache check
- **AC2 caching uses `reference_image_url` as the cache signal** — if `reference_image_url` is already set on the restaurant, reuse it for any new placeholder recipes without calling the Places API again (repeat enrichment pass). Only call Places when `reference_image_url` is null (first enrichment pass). `already_enriched` = no placeholder recipes + `reference_image_url` set
- **Supabase errors must be checked** — destructure `{ data, error }` on all DB calls; return 503 `DATABASE_ERROR` on fetch errors; log but continue on update errors (partial success is reported accurately via `photosAssigned`)

---

## File Scope

### Files to create

| File | Notes |
|------|-------|
| `src/app/api/places/enrich/route.ts` | New POST route — full implementation |
| `src/app/api/places/enrich/route.test.ts` | Co-located test file — all required cases |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/lib/placesPhotos.ts` | Correct as-is; this route is a consumer, not an owner |
| `src/app/api/places/photos/route.ts` | Separate route; different concern (photo URL lookup by placeId) |
| `src/app/api/places/search/route.ts` | Separate route; different concern (text search) |
| `src/app/api/places/nearby/route.ts` | Separate route; different concern (nearby search) |
| `src/lib/api-keys.ts` | Correct; do not modify |
| `src/lib/supabase.ts` | Correct; singleton enforced |
| `src/types/database.ts` | Schema types are correct; `photo_status` enum already includes `confirmed | placeholder | suppressed` |
| Any component files | This story is API-only; UI rendering of the photo states is Story 3.3 |

---

## Key Context from Epic 3

Story 3.1 is the Phase 2 enrichment entry point for the photo half of the ARCH12 pattern:

- **Story 2.3 (Restaurant Confirmation — done)** auto-captures recipes with `photo_status: 'placeholder'`. Story 3.1 upgrades those records to `photo_status: 'confirmed'` by assigning Google Places photo URLs.
- **Story 3.3 (Dish Photo Rendering — Three-Tier State System)** reads `photo_status` and `dish_image_url` to decide which component to render. Story 3.1 must write correct values to both columns for Story 3.3 to function properly.
- **Story 3.6 (Progressive Enrichment UX)** coordinates the in-place card update when Phase 2 enrichment completes. The TanStack Query invalidation (`["recipes", restaurantId]`) that triggers Story 3.6's re-render happens in the client caller of this route — not in this route itself.
- **Story 3.2 (USDA Macro Verification)** is an independent enrichment pass for nutrition data — it operates on the same restaurant's recipes but is not a dependency for Story 3.1.
- **NFR19** is the architectural basis for the one-request-per-restaurant design. A per-dish implementation would violate this requirement.
- **`restaurants.reference_image_url`** — this column drives the atmospheric background layer in the restaurant screen (ARCH15). Populating it here enables the restaurant header photo to appear after enrichment.

**Parallel work**: Stories 3.1, 3.2, and 3.3 are designed to be developed in parallel. Story 3.1 and Story 3.2 operate on the same `recipes` rows but update different columns (`dish_image_url`/`photo_status` vs. macro columns). They will not conflict at the database level, but coordinate if both stories are in the same sprint to avoid merging conflicts in `route.test.ts` patterns.

---

## Relevant Previous Story Context

### From Story 1.1 — Infrastructure Hardening (done)
- `src/lib/supabase.ts` throws at build time on missing env vars — correct and in place
- `src/lib/api-keys.ts` has `import 'server-only'` — ARCH18 enforcement is active

### From Story 1.2 — Database Schema Baseline (done)
- `recipes.photo_status` column exists as an enum: `confirmed | placeholder | suppressed`
- `recipes.dish_image_url` column exists as `text | null`
- `restaurants.place_id` column exists as `text | null`
- `restaurants.reference_image_url` column exists as `text | null`

### From Story 2.3 — Restaurant Confirmation & Auto-Capture (done)
- All newly scanned recipes are created with `photo_status: 'placeholder'` by default
- This route is the mechanism that transitions those records to `photo_status: 'confirmed'`

### From existing `src/lib/placesPhotos.ts`
- `getRestaurantPhotos({ placeId }, apiKey, maxPhotos?)` returns `string[]` — all HTTPS URLs, empty array on any failure
- The function never throws; the `try/catch` wrapper in the route handler is a belt-and-suspenders guard
- Maximum 10 photos per call is the default used by the existing `places/photos/route.ts` — use the same cap here

---

## Definition of Done

- [x] `src/app/api/places/enrich/route.ts` created with `POST` handler
- [x] `import 'server-only'` at file top
- [x] Zod `RequestSchema` validates `restaurantId` as a UUID (422 on failure)
- [x] Missing Places API key returns 503 `PLACES_SERVICE_UNAVAILABLE`
- [x] Restaurant not found in DB returns 404 `NOT_FOUND`
- [x] No `place_id` on restaurant returns 200 with `{ skipped: true, reason: "no_place_id" }` (not an error)
- [x] All non-`placeholder` recipes trigger the `already_enriched` early-exit (200 with `{ skipped: true, reason: "already_enriched" }`)
- [x] `getRestaurantPhotos` called exactly once per request — never in a loop (NFR19)
- [x] Photos assigned round-robin to placeholder recipes; `photo_status` set to `confirmed`; `dish_image_url` written
- [x] `restaurants.reference_image_url` updated with `photos[0]` when currently null
- [x] `getRestaurantPhotos` throw returns 503 `PLACES_UNAVAILABLE`
- [x] All error responses use nested `{ error: { message, code } }` envelope (ARCH7)
- [x] `src/app/api/places/enrich/route.test.ts` created with all required test cases
- [x] All tests pass (`vitest run`)
- [x] TypeScript strict mode passes (`tsc --noEmit`) — new files clean; pre-existing errors unrelated to this story
- [x] No regressions to `places/photos/route.ts`, `places/search/route.ts`, or `places/nearby/route.ts`

---

## Dev Agent Record

### Implementation Notes

Implemented exactly as spec'd. One spec inconsistency noted and resolved:

**Story spec inconsistency — round-robin vs. test assertion:**
The story's "Handler logic" (Step 7) specifies round-robin photo assignment using `i % photos.length`, which means all placeholder recipes receive a photo (reusing photos if there are fewer photos than recipes). The "Tests Required" section contradicted this by asserting `photosAssigned: 2` for "2 photos, 5 recipes". The round-robin implementation was used as the authoritative spec (it is more explicit and serves the product goal of every dish having some photo). The test for this scenario accordingly asserts `photosAssigned: 5` with 5 recipe UPDATE calls.

### File List

| File | Change |
|------|--------|
| `src/app/api/places/enrich/route.ts` | Created — POST handler |
| `src/app/api/places/enrich/route.test.ts` | Created — 14 test cases |
| `planning/sprint-status.yaml` | Updated 3-1 status: ready-for-dev → in-progress → review |
| `planning/3-1-google-places-enrichment-api-route.md` | Updated status and DoD checkboxes |

### Change Log

- 2026-04-12: Implemented `POST /api/places/enrich` route with full test coverage (14 tests, 0 regressions). Story 3.1 complete.
