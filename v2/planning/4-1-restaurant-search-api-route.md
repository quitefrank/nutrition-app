# Story 4.1: Restaurant Search API Route

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to search for a restaurant by name and have the app find it via Google Places,
So that I can build my collection without needing to scan a physical menu.

---

## Acceptance Criteria

**AC1 — Zod validation on request input**
**Given** a GET request is sent to `/api/places/search` with a restaurant name query
**When** the request is validated with Zod
**Then** a missing or empty query returns `{ error: { message: string; code: "VALIDATION_ERROR" } }` with HTTP 422

> Note: The epics spec says GET but the existing `src/app/api/places/search/route.ts` already implements this endpoint as **POST** (matching the Places API Text Search pattern and the nearby/enrich/photos sibling routes). Do NOT change to GET — keep POST to stay consistent with the project's API conventions. See "Existing Route" section below.

**AC2 — Valid query calls Places API and returns results**
**Given** a valid search query is received
**When** the Places API is called
**Then** the response is validated against a Zod schema; up to 5 matching restaurant results are returned as `{ data: [{ placeId, name, address, rating, userRatingCount, photoUrl }] }`

**AC3 — Results include a photo URL per result**
**Given** the Places API returns restaurant results
**When** photo URLs are resolved
**Then** each result includes `photoUrl` (string URL or `null` when unavailable); photos are fetched once per result via `getRestaurantPhotos`

**AC4 — Caching: cached Places result returned on repeat search**
**Given** a restaurant has been fetched before
**When** the same restaurant is searched again
**Then** the cached Places result is returned without making a new API call

> Note: AC4 (caching) is not yet implemented in the existing route (see "Existing Route" section). This story's job is to add the caching layer. Cache implementation uses Supabase — see "Caching Strategy" under Dev Notes.

**AC5 — Places API failure returns 503 with correct error code**
**Given** the Places API fails
**When** the error is returned
**Then** the route returns `{ error: { message: string; code: "PLACES_UNAVAILABLE" } }` with HTTP 503; the client shows a degraded state rather than crashing

---

## This Is Brownfield — Audit First, Fix Second

`src/app/api/places/search/route.ts` **already exists** and partially implements this story. Before writing any code, read the existing file completely.

### What the existing route already does correctly

- `import 'server-only'` at the top (ARCH18 compliant)
- `getApiKeys().places` for API key access (ARCH18 compliant)
- Zod `RequestSchema` validates `query`, optional `lat`/`lng`
- Zod `PlacesResponseSchema` is lenient (`.catch([])`) for Places response
- `apiError` helper returns nested `{ error: { message, code } }` envelope (ARCH7)
- 8-second timeout via `AbortController`
- `getRestaurantPhotos` called once per result (best-effort, degrades to `null`)
- Returns `{ data: results }` on success with correct shape
- Tests in `src/app/api/places/search/route.test.ts` — 5 existing tests, all passing

### What is MISSING (this story adds)

- **AC4 — Caching**: No caching layer exists. Repeat searches for the same restaurant hit the Places API every time. This story adds a Supabase-backed cache check before calling Places.
- **AC2 — Result count cap**: The epics spec says "up to 5 results". The existing route returns however many Places returns (no explicit slice). Add `.slice(0, 5)` on the `baseResults` array.

### What NOT to change

- The POST verb and route path (do not change to GET)
- The request body schema (keep `query`, `lat`, `lng`)
- The `PlacesResponseSchema` (lenient schema is correct per ARCH8)
- The `getRestaurantPhotos` integration (correct as-is)
- The `apiError` helper
- The response envelope shape
- Existing tests — add new test cases without breaking the existing 5

---

## Tasks / Subtasks

- [x] Task 1: Read and understand the existing route (AC: all)
  - [x] Read `src/app/api/places/search/route.ts` completely
  - [x] Read `src/app/api/places/search/route.test.ts` completely
  - [x] Read `src/lib/placesPhotos.ts` to understand `getRestaurantPhotos` signature
  - [x] Read `src/lib/supabase.ts` to confirm singleton import pattern

- [x] Task 2: Add result cap of 5 to the existing route (AC: #2)
  - [x] Add `.slice(0, 5)` after the `baseResults` filter step

- [x] Task 3: Implement Places caching layer (AC: #4)
  - [x] Add Supabase import to the route file
  - [x] Before calling Places API, check `restaurants` table for existing rows with matching `place_id` or name that were fetched recently
  - [x] See "Caching Strategy" in Dev Notes for the exact DB query pattern
  - [x] If cache hit found, return cached results without calling Places API
  - [x] If cache miss, call Places API and proceed as normal (no write-through needed at search time — data is written to DB during the Restaurant Confirmation step)

- [x] Task 4: Update tests to cover new behaviour (AC: #2, #4)
  - [x] Add test: returns at most 5 results when Places returns more
  - [x] Add test: cache hit path returns cached data without calling Places API
  - [x] Add test: cache miss path calls Places API normally
  - [x] Ensure all 5 existing tests still pass

- [x] Task 5: TypeScript and test verification
  - [x] Run `tsc --noEmit` — fix any type errors in modified files only
  - [x] Run `vitest run src/app/api/places/search/route.test.ts` — all tests pass

---

## Dev Notes

### Existing Route File

**Location:** `src/app/api/places/search/route.ts`

The route is POST (not GET). Full handler already in place — this story extends it, not replaces it.

```
POST /api/places/search
Content-Type: application/json

{ "query": "Sala Thai", "lat": 43.65, "lng": -79.38 }
```

Response (success):
```json
{
  "data": [
    {
      "placeId": "ChIJ...",
      "name": "Sala Thai",
      "address": "123 Main St",
      "rating": 4.5,
      "userRatingCount": 320,
      "photoUrl": "https://..."
    }
  ]
}
```

### Caching Strategy

The epics spec says: "a cached Places result is returned without making a new API call". The cache must be Supabase-backed (TanStack Query is client-side only).

**Cache check query:** Before calling Places API, query `restaurants` table for any row with `name` matching the search query (case-insensitive) and a `place_id` already set:

```typescript
import { supabase } from '@/lib/supabase'

// Case-insensitive search of existing restaurant records
const { data: cached } = await supabase
  .from('restaurants')
  .select('id, name, place_id, address, rating, user_ratings_total, reference_image_url')
  .ilike('name', query.trim())
  .not('place_id', 'is', null)
  .limit(5)

if (cached && cached.length > 0) {
  // Map cached rows to the search result shape
  const results = cached.map(r => ({
    placeId: r.place_id!,
    name: r.name,
    address: r.address ?? '',
    rating: r.rating ?? null,
    userRatingCount: r.user_ratings_total ?? null,
    photoUrl: r.reference_image_url ?? null,
  }))
  return NextResponse.json({ data: results })
}
```

> The `ilike` operator is PostgreSQL case-insensitive LIKE. This gives "fuzzy" matching so "sala thai" hits "Sala Thai". This is intentionally simple — exact match is acceptable for MVP.

**No write-through at search time:** The cache is populated when the user confirms a restaurant (Story 2.3 and 4.2 write the `restaurants` row). This route only reads from the cache — it does not write to it. A cache miss simply falls through to the Places API call.

**Cache staleness:** No TTL is enforced at the search route level. The `restaurants` table row persists indefinitely. For MVP this is acceptable — cache invalidation is out of scope.

### Response Shape (canonical)

The existing route already returns the correct shape. Confirm it matches:

```typescript
// Success
{ data: Array<{ placeId: string; name: string; address: string; rating: number | null; userRatingCount: number | null; photoUrl: string | null }> }

// Error
{ error: { message: string; code: string } }
```

HTTP status codes:
- `200` — success (even if results array is empty)
- `400` — invalid JSON body
- `422` — Zod validation failure (missing or empty `query`)
- `503` — Places API unavailable or missing API key

### Architecture Guardrails

All rules from ARCH7, ARCH8, ARCH18 apply:

- `import 'server-only'` must remain at the top (already present — do not remove)
- `getApiKeys().places` is the only API key access pattern (already present)
- `import { supabase } from '@/lib/supabase'` for Supabase access — never call `createClient()` inline (ARCH2)
- All Places response parsing uses lenient Zod with `.catch([])` (already present — do not change to strict)
- Return `{ data: T }` or `{ error: { message, code } }` — no other shapes (ARCH7)
- Do not log user-provided query strings verbatim — PII concern (SEC-DAT-1.00 / NFR9)
- Log prefix pattern: `[places/search]` — matches existing sibling routes

### `getRestaurantPhotos` Reference

Already imported and used in the existing route. Signature:

```typescript
// src/lib/placesPhotos.ts
async function getRestaurantPhotos(
  { placeId }: { placeId: string },
  apiKey: string,
  maxPhotos?: number
): Promise<string[]>
```

Returns `string[]` of HTTPS URLs. Returns `[]` on any failure — never throws. The `.catch(() => [])` in the existing route is belt-and-suspenders (correct).

### Supabase Schema Reference (relevant columns)

`restaurants` table (established in Story 1.2):
- `id` — uuid PK
- `name` — text
- `place_id` — text | null (set when restaurant is confirmed via Places)
- `address` — text | null
- `rating` — numeric | null
- `user_ratings_total` — integer | null
- `reference_image_url` — text | null (set by Story 3.1 enrich route)

All collection queries must use `neq('status', 'removed')` for recipes. For restaurants, there is no `status` column — a removed restaurant means its recipes have `status = 'removed'`, but the restaurant row itself remains. The cache query reads `restaurants` directly without status filtering (correct).

### TanStack Query Integration (client-side context)

This story is API-only. The client hook that calls this route is implemented in Story 4.2. Query key for the caller will be:
```typescript
useQuery({ queryKey: ["restaurant-search", query] })
```
This story does not implement the hook — just the route.

### NFR2 Context

The search performance target is **≤5 seconds on LTE** for all dish cards to render (NFR2). This route is one leg of that journey:
- Search route response should be fast (Places API typically <1s)
- Caching eliminates the Places round-trip for repeat searches
- Photo resolution runs in parallel via `Promise.all` (already implemented in existing route)

---

### Project Structure Notes

- **Route file:** `src/app/api/places/search/route.ts` (existing — modify in place)
- **Test file:** `src/app/api/places/search/route.test.ts` (existing — add new cases)
- **No new files required** — this story extends an existing route only
- **Co-located tests:** Confirmed — test file already sits next to route file (ARCH pattern)

**Files NOT to touch:**
| File | Reason |
|------|--------|
| `src/app/api/places/nearby/route.ts` | Separate concern (geolocation-based nearby search) |
| `src/app/api/places/enrich/route.ts` | Separate concern (post-capture photo enrichment) |
| `src/app/api/places/photos/route.ts` | Separate concern (photo URL lookup) |
| `src/lib/placesPhotos.ts` | Correct as-is; consumer, not owner |
| `src/lib/api-keys.ts` | Correct; do not modify |
| `src/lib/supabase.ts` | Correct; singleton enforced |
| Any component files | This story is API-only |

---

### References

- [Source: planning/epics.md#Story-4.1] — Acceptance criteria and story definition
- [Source: planning/architecture.md#API-Patterns] — ARCH7 (response envelope), ARCH8 (Zod), ARCH18 (API key isolation)
- [Source: planning/architecture.md#Naming-Patterns] — API naming conventions, camelCase fields
- [Source: planning/architecture.md#Communication-Patterns] — TanStack Query key conventions
- [Source: planning/prd.md#Restaurant-Discovery] — FR7, FR8, FR9, FR44
- [Source: planning/prd.md#NonFunctional-Requirements] — NFR2 (search ≤5s), NFR7 (server-only keys), NFR9 (no PII logs), NFR19 (Places cached after first fetch)
- [Source: src/app/api/places/search/route.ts] — Existing implementation to extend
- [Source: src/app/api/places/search/route.test.ts] — Existing tests to preserve and extend
- [Source: planning/3-1-google-places-enrichment-api-route.md] — Pattern reference for Supabase integration and test approach

---

## Tests Required

**Test file location:** `src/app/api/places/search/route.test.ts`
(Already exists — add new cases, preserve all 5 existing)

### Test setup (already in place — do not duplicate)

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetApiKeys = vi.hoisted(() => vi.fn(() => ({ places: 'places-test-key' as string | undefined })))
const mockGetRestaurantPhotos = vi.hoisted(() => vi.fn().mockResolvedValue([]))

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@/lib/placesPhotos', () => ({ getRestaurantPhotos: mockGetRestaurantPhotos }))

global.fetch = vi.fn()

import { POST } from './route'
```

For Supabase mock (new requirement for caching):

```typescript
// Add to hoisted section
const mockSupabaseFrom = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { from: mockSupabaseFrom } }))

// Helper: build a Supabase fluent chain mock
function makeSupabaseChain(returnValue: { data: unknown; error: null | object }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  }
  mockSupabaseFrom.mockReturnValue(chain)
  return chain
}
```

### Required new test cases

```
describe('POST /api/places/search')
  ├── [EXISTING - do not change]
  │   ├── missing Places API key → 503, code: PLACES_UNAVAILABLE
  │   ├── invalid JSON body → 400, code: INVALID_REQUEST
  │   ├── missing query → 422, code: VALIDATION_ERROR
  │   ├── empty string query → 422, code: VALIDATION_ERROR
  │   ├── Places API returns non-200 → 503, code: PLACES_UNAVAILABLE
  │   └── success → data array with correct shape (placeId, name, address, rating, userRatingCount, photoUrl)
  │
  ├── [NEW] result cap
  │   └── Places returns 7 results → data array has at most 5 entries
  │
  ├── [NEW] caching
  │   ├── cache hit (restaurant in DB with place_id) → returns cached data without calling fetch
  │   ├── cache miss (no matching restaurant in DB) → calls Places API normally
  │   └── cache hit → photoUrl sourced from restaurants.reference_image_url (may be null)
  │
  └── [NEW] response envelope
      └── all error responses use nested { error: { message, code } } — not flat { error: "..." }
```

---

## Definition of Done

- [ ] `src/app/api/places/search/route.ts` modified: result array sliced to max 5 entries
- [ ] `src/app/api/places/search/route.ts` modified: Supabase cache check added before Places API call
- [ ] Cache hit returns `{ data: results }` without calling `fetch` or `getRestaurantPhotos`
- [ ] Cache miss falls through to existing Places API call path unchanged
- [ ] `import { supabase } from '@/lib/supabase'` used for DB access (no inline client)
- [ ] `import 'server-only'` remains at the top of the route file
- [ ] All error responses use nested `{ error: { message, code } }` envelope (ARCH7)
- [ ] No user query text logged verbatim (NFR9 / SEC-DAT-1.00)
- [ ] `src/app/api/places/search/route.test.ts` updated with new test cases for caching and result cap
- [ ] All previously passing tests (5 existing) still pass
- [ ] All new test cases pass
- [ ] `tsc --noEmit` passes — no new TypeScript errors in modified files
- [ ] No regressions to `places/nearby/route.ts`, `places/enrich/route.ts`, or `places/photos/route.ts`

---

## Key Context from Epic 4

Story 4.1 is the API foundation for the restaurant search path in Epic 4:

- **Story 4.2 (Restaurant Search UI & Dish Auto-Capture)** is the primary consumer of this route. It will call `POST /api/places/search` and use the returned `placeId` to initiate dish auto-capture. This story must be complete and stable before 4.2 begins.
- **Story 3.1 (Google Places Enrichment — done)** established the `restaurants.reference_image_url` column as the caching signal. The cache hit in this story reads that same column for `photoUrl`.
- **FR44 (caching)** is the key functional requirement this story satisfies: "System caches Google Places restaurant data after first fetch to avoid redundant API calls on subsequent views." The Supabase-backed cache check is the MVP implementation of FR44 for the search path.
- **NFR19** (Places calls batched and cached per restaurant, no per-dish requests) is satisfied by the existing route structure — one `Promise.all` across results, not per-dish loops.

---

## Relevant Previous Story Context

### From Story 1.1 — Infrastructure Hardening (done)
- `src/lib/supabase.ts` throws at build time on missing env vars — correct and in place
- `src/lib/api-keys.ts` has `import 'server-only'` — ARCH18 enforcement is active

### From Story 1.2 — Database Schema Baseline (done)
- `restaurants` table exists with `place_id`, `reference_image_url`, `rating`, `user_ratings_total`, `address` columns
- `recipes.status` enum (`auto_captured | kept | removed`) used in all collection queries
- `recipes.photo_status` enum (`confirmed | placeholder | suppressed`) in place

### From Story 2.3 — Restaurant Confirmation & Auto-Capture (done)
- When a user confirms a restaurant, a `restaurants` row is created with `place_id` set
- This is the write-through path that populates the cache this story reads from
- `restaurant_visits` row is created with `visit_type: 'scan'`

### From Story 3.1 — Google Places Enrichment API Route (done)
- `restaurants.reference_image_url` is set by the enrich route after first Places photo fetch
- This column is the `photoUrl` source for cache-hit responses in this story
- Pattern established: import `supabase` from `@/lib/supabase`, use fluent chain, check `{ data, error }` destructuring

### From existing `src/app/api/places/search/route.ts`
- Route is POST, not GET — consistent with all sibling routes in `places/`
- `getRestaurantPhotos` already integrated correctly — do not re-implement
- `PlacesResponseSchema` uses `.catch([])` — correct lenient schema per ARCH8
- `apiError` helper signature: `(message: string, code: string, status: 400 | 422 | 500 | 502 | 503)`

### From Stories 3.1–3.6 — Pattern established for Supabase in API routes
- Always destructure `{ data, error }` from Supabase calls
- Return `apiError('Database error', 'DATABASE_ERROR', 503)` on DB errors
- Log errors with `console.error('[route-prefix] ...')` without user PII

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(none — clean implementation, no blockers)

### Completion Notes List

- Added `import { supabase } from "@/lib/supabase"` to route (ARCH2 singleton pattern).
- Supabase cache check added before Places API call: queries `restaurants` table with `.ilike('name', query.trim()).not('place_id', 'is', null).limit(5)`. Cache errors are non-fatal — logged and falls through to Places.
- Cache hit returns `{ data: results }` immediately without calling `fetch` or `getRestaurantPhotos`. `photoUrl` is sourced from `reference_image_url` column (may be null).
- Cache miss falls through to existing Places API call path unchanged.
- `.slice(0, 5)` added to `baseResults` after filter/map to cap results at 5 (AC2).
- No user query text logged verbatim (NFR9 / SEC-DAT-1.00 compliant).
- `import 'server-only'` preserved at top of route (ARCH18 compliant).
- All 5 existing tests preserved and still pass.
- 6 new tests added: result cap, cache hit (no fetch), cache miss (fetch called), cache hit with null photoUrl, error envelope shape.
- Total: 11 tests, all passing. `tsc --noEmit` clean for modified files.

### File List

- src/app/api/places/search/route.ts (modified)
- src/app/api/places/search/route.test.ts (modified)

## Change Log

- 2026-04-12: Implemented Story 4.1 — added Supabase cache check (AC4) and result cap of 5 (AC2); extended test suite from 5 to 11 tests.
